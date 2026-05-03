import logging
import random, httpx, os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi.encoders import jsonable_encoder
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from jose import jwt
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field

from app.config.db import get_database
from app.deps import get_users_collection
from app.middleware.auth import get_current_user
from app.models.user import (
    ForgotPasswordRequest,
    GoogleAuthRequest,
    ResendOTPRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyEmailRequest,
)
from app.utils.mailer import generate_otp, send_otp_email


# Always load backend/.env even when app is started from repository root.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["auth"])

logger = logging.getLogger(__name__)


class UpdateUsernameRequest(BaseModel):
    new_username: str = Field(..., min_length=3, max_length=30)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


def _build_user_payload(user: dict) -> dict:
    created_at = user.get("createdAt")
    if not isinstance(created_at, datetime):
        created_at = datetime.now(timezone.utc)

    return {
        "id": str(user.get("_id")),
        "username": user.get("username") or user.get("name", ""),
        "email": user.get("email", ""),
        "createdAt": created_at,
        "photoUrl": user.get("photoUrl", ""),
    }


def _build_auth_response(user: dict, *, status_code: int = status.HTTP_200_OK):
    token = _create_access_token(str(user.get("_id")))
    payload = {"token": token, "user": _build_user_payload(user)}
    if status_code == status.HTTP_200_OK:
        return payload

    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))

def _get_jwt_secret() -> str:
    jwt_secret = os.getenv("JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret not configured",
        )
    return jwt_secret


def _create_access_token(user_id: str, is_demo: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire, "is_demo": is_demo}
    return jwt.encode(payload, _get_jwt_secret(), algorithm=ALGORITHM)


def _to_user_response(user: dict) -> UserResponse:
    created_at = user.get("createdAt")
    if not isinstance(created_at, datetime):
        created_at = datetime.utcnow()

    return UserResponse(
        id=str(user.get("_id")),
        username=user.get("username") or user.get("name", ""),
        email=user.get("email", ""),
        createdAt=created_at,
        photoUrl=user.get("photoUrl", ""),
    )


@router.post("/register")
async def register(
    payload: UserRegister,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):

    existing_user = await users_collection.find_one({"email": payload.email})
    if existing_user is not None and existing_user.get("isVerified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    now = datetime.now(timezone.utc)
    otp = generate_otp()
    hashed_otp = pwd_context.hash(otp)
    otp_expiry = now + timedelta(minutes=10)

    if existing_user is not None:
        await users_collection.update_one(
            {"_id": existing_user["_id"]},
            {
                "$set": {
                    "emailOTP": hashed_otp,
                    "emailOTPExpiry": otp_expiry,
                    "isVerified": False,
                }
            },
        )
        try:
            await send_otp_email(
                payload.email,
                "Verify your PortSense account",
                otp,
                "verify",
            )
        except Exception as exc:
            logger.error("OTP email failed for %s: %r", payload.email, exc, exc_info=True)
        return {
            "message": "Verification OTP resent",
            "requiresVerification": True,
        }

    hashed_password = pwd_context.hash(payload.password)
    await users_collection.insert_one(
        {
            "username": payload.username,
            "email": payload.email,
            "password": hashed_password,
            "createdAt": now,
            "isVerified": False,
            "authProvider": "local",
            "emailOTP": hashed_otp,
            "emailOTPExpiry": otp_expiry,
        }
    )

    try:
        await send_otp_email(
            payload.email,
            "Verify your PortSense account",
            otp,
            "verify",
        )
    except Exception as exc:
        logger.error("OTP email failed for %s: %r", payload.email, exc, exc_info=True)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "message": "Registration successful. Please verify your email.",
            "requiresVerification": True,
        },
    )


@router.post("/login")
async def login(
    payload: UserLogin,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):

    user = await users_collection.find_one({"email": payload.email})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.get("isVerified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email first",
        )

    if user.get("authProvider") == "google" and not user.get("password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In. Please login with Google.",
        )

    if not pwd_context.verify(payload.password, user.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    is_demo_user = bool(user.get("is_demo"))
    if user.get("is_demo"):
        db = get_database()
        holdings_collection = db["holdings"]

        # Import DEMO_HOLDINGS inline to avoid circular imports
        from seed import DEMO_HOLDINGS
        from datetime import datetime, timezone

        await holdings_collection.delete_many({"userId": user["_id"]})

        now = datetime.now(timezone.utc)
        documents = []
        for item in DEMO_HOLDINGS:
            doc = {
                "userId": user["_id"],
                "ticker": item["ticker"],
                "buyDate": datetime.strptime(item["buyDate"], "%Y-%m-%d").replace(tzinfo=timezone.utc),
                "buyPrice": item["buyPrice"],
                "quantity": item["quantity"],
                "assetType": item.get("assetType", "stock"),
                "createdAt": now,
            }
            if item.get("schemeName"):
                doc["schemeName"] = item["schemeName"]
            if item.get("fdRate"):
                doc["fdRate"] = item["fdRate"]
            if item.get("mfCategory"):
                doc["mfCategory"] = item["mfCategory"]
            documents.append(doc)
        await holdings_collection.insert_many(documents)

    token = _create_access_token(str(user.get("_id")), is_demo=is_demo_user)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/verify-email")
async def verify_email(
    payload: VerifyEmailRequest,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    user = await users_collection.find_one(
        {"email": payload.email},
        projection={
            "username": 1,
            "email": 1,
            "createdAt": 1,
            "photoUrl": 1,
            "isVerified": 1,
            "emailOTP": 1,
            "emailOTPExpiry": 1,
        },
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.get("isVerified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified",
        )

    email_otp = user.get("emailOTP")
    if email_otp is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No OTP found. Please request a new one.",
        )

    email_otp_expiry = user.get("emailOTPExpiry")
    if not isinstance(email_otp_expiry, datetime):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired. Please request a new one.",
        )

    # Normalize DB datetimes to UTC-aware before comparison
    if email_otp_expiry.tzinfo is None or email_otp_expiry.tzinfo.utcoffset(email_otp_expiry) is None:
        email_otp_expiry = email_otp_expiry.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > email_otp_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired. Please request a new one.",
        )

    if not pwd_context.verify(payload.otp, email_otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP",
        )

    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"isVerified": True, "emailOTP": None, "emailOTPExpiry": None}
        },
    )

    user["isVerified"] = True
    user["emailOTP"] = None
    user["emailOTPExpiry"] = None
    return _build_auth_response(user)


@router.post("/resend-otp")
async def resend_otp(
    payload: ResendOTPRequest,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    user = await users_collection.find_one({"email": payload.email})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    if user.get("isVerified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified",
        )

    otp = generate_otp()
    hashed_otp = pwd_context.hash(otp)
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)

    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"emailOTP": hashed_otp, "emailOTPExpiry": otp_expiry}},
    )
    await send_otp_email(payload.email, "Verify your PortSense account", otp, "verify")
    return {"message": "OTP resent"}


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    user = await users_collection.find_one({"email": payload.email})
    if user is None:
        return {"message": "If an account exists, an OTP has been sent."}

    if user.get("authProvider") == "google" and not user.get("password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In and has no password.",
        )

    otp = generate_otp()
    hashed_otp = pwd_context.hash(otp)
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)

    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "passwordResetOTP": hashed_otp,
                "passwordResetExpiry": otp_expiry,
            }
        },
    )
    await send_otp_email(payload.email, "Reset your PortSense password", otp, "reset")
    return {"message": "If an account exists, an OTP has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    user = await users_collection.find_one(
        {"email": payload.email},
        projection={
            "passwordResetOTP": 1,
            "passwordResetExpiry": 1,
        },
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    password_reset_otp = user.get("passwordResetOTP")
    if password_reset_otp is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No reset request found",
        )

    password_reset_expiry = user.get("passwordResetExpiry")
    if not isinstance(password_reset_expiry, datetime):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired",
        )

    # Normalize DB datetimes to UTC-aware before comparison
    if password_reset_expiry.tzinfo is None or password_reset_expiry.tzinfo.utcoffset(password_reset_expiry) is None:
        password_reset_expiry = password_reset_expiry.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > password_reset_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired",
        )

    if not pwd_context.verify(payload.otp, password_reset_otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP",
        )

    hashed = pwd_context.hash(payload.newPassword)
    await users_collection.update_one(
        {"email": payload.email},
        {
            "$set": {
                "password": hashed,
                "passwordResetOTP": None,
                "passwordResetExpiry": None,
            }
        },
    )
    return {"message": "Password reset successful"}


@router.post("/google", status_code=status.HTTP_200_OK)
async def google_auth(
    payload: GoogleAuthRequest,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.idToken}"
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    google_payload = response.json()
    if google_payload.get("aud") != os.getenv("GOOGLE_CLIENT_ID"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    if google_payload.get("email_verified") != "true":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email not verified",
        )

    google_id = google_payload.get("sub")
    email = google_payload.get("email")
    name = google_payload.get("name")
    picture = google_payload.get("picture", "")

    user = await users_collection.find_one({"googleId": google_id})
    if user is not None:
        update_fields = {}
        if not user.get("photoUrl") and picture:
            update_fields["photoUrl"] = picture

        if update_fields:
            await users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": update_fields},
            )
            user.update(update_fields)

        return _build_auth_response(user)

    user = await users_collection.find_one({"email": email})
    if user is not None:
        update_data = {"googleId": google_id, "isVerified": True}
        if not user.get("photoUrl") and picture:
            update_data["photoUrl"] = picture

        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": update_data},
        )
        user.update(update_data)
        # Ensure response includes the updated photoUrl (use new value if set, else fall back to existing)
        response_photo = update_data.get("photoUrl") or user.get("photoUrl", "")
        user["photoUrl"] = response_photo
        return _build_auth_response(user)

    now = datetime.now(timezone.utc)
    insert_result = await users_collection.insert_one(
        {
            "username": name,
            "email": email,
            "googleId": google_id,
            "photoUrl": picture,
            "authProvider": "google",
            "isVerified": True,
            "password": None,
            "createdAt": now,
        }
    )

    new_user = await users_collection.find_one({"_id": insert_result.inserted_id})
    if new_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create Google account",
        )

    return _build_auth_response(new_user, status_code=status.HTTP_201_CREATED)


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)):
    return _to_user_response(current_user)


@router.put("/update-username")
async def update_username(
    payload: UpdateUsernameRequest,
    current_user: dict = Depends(get_current_user),
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    existing_user = await users_collection.find_one(
        {
            "username": {
                "$regex": f"^{re.escape(payload.new_username)}$",
                "$options": "i",
            },
            "_id": {"$ne": current_user.get("_id")},
        }
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    await users_collection.update_one(
        {"_id": current_user.get("_id")},
        {"$set": {"username": payload.new_username}},
    )

    return {"message": "Username updated successfully"}


@router.put("/update-profile")
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    updated_photo_url = payload.photoUrl.strip()
    await users_collection.update_one(
        {"_id": current_user.get("_id")},
        {"$set": {"photoUrl": updated_photo_url}},
    )

    return {"message": "Profile updated", "photoUrl": updated_photo_url}


@router.put("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):
    user = await users_collection.find_one({"_id": current_user.get("_id")})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not pwd_context.verify(payload.current_password, user.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    hashed_password = pwd_context.hash(payload.new_password)
    await users_collection.update_one(
        {"_id": current_user.get("_id")},
        {"$set": {"password": hashed_password}},
    )

    return {"message": "Password changed successfully"}