from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .weekly_recap import Log, Plan, WeekFacts, summarize_week

router = APIRouter()


class RecapRequest(BaseModel):
    plan: Plan
    logs: list[Log] = Field(max_length=7)
    as_of: date


@router.post("/api/v1/weekly-recap", response_model=WeekFacts)
def weekly_recap(request: RecapRequest) -> WeekFacts:
    try:
        return summarize_week(request.plan, request.logs, today=request.as_of)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
