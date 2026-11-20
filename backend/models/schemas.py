from pydantic import BaseModel


class SignUpRequest(BaseModel):
    login: str
    name: str
    surname: str
    middlename: str = ""
    pass_: str  # 'pass' is a Python keyword

    model_config = {"populate_by_name": True}

    @classmethod
    def model_validate_json_alias(cls, data: dict):
        data = dict(data)
        if "pass" in data:
            data["pass_"] = data.pop("pass")
        return cls(**data)


class SignInRequest(BaseModel):
    login: str
    pass_: str

    model_config = {"populate_by_name": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    login: str
    name: str
    surname: str
    middlename: str = ""

    model_config = {"from_attributes": True}
