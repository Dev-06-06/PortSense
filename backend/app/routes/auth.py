import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from datetime import timezone

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field

from app.deps import get_users_collection
from app.middleware.auth import get_current_user
from app.models.user import UserLogin, UserRegister, UserResponse


# Always load backend/.env even when app is started from repository root.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["auth"])


class UpdateUsernameRequest(BaseModel):
    new_username: str = Field(..., min_length=3, max_length=30)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)

def _get_jwt_secret() -> str:
    jwt_secret = os.getenv("JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret not configured",
        )
    return jwt_secret


def _create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire}
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
    )


@router.post("/register")
async def register(
    payload: UserRegister,
    users_collection: AsyncIOMotorCollection = Depends(get_users_collection),
):

    existing_user = await users_collection.find_one({"email": payload.email})
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    hashed_password = pwd_context.hash(payload.password)
    # Use datetime.now with timezone awareness (UTC)
    now = datetime.now(timezone.utc)

    insert_result = await users_collection.insert_one(
        {
            "username": payload.username,
            "email": payload.email,
            "password": hashed_password,
            "createdAt": now,
        }
    )

    token = _create_access_token(str(insert_result.inserted_id))
    return {"access_token": token, "token_type": "bearer"}


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

    if not pwd_context.verify(payload.password, user.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = _create_access_token(str(user.get("_id")))
    return {"access_token": token, "token_type": "bearer"}


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