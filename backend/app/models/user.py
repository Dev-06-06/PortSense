from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    createdAt: datetime
    photoUrl: str = ""


class UpdateProfileRequest(BaseModel):
    photoUrl: str = ""


class GoogleAuthRequest(BaseModel):
    idToken: str


class VerifyEmailRequest(BaseModel):
    email: str
    otp: str


class ResendOTPRequest(BaseModel):
    email: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    newPassword: str
