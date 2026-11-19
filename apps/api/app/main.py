from fastapi import FastAPI
from app.weekly_recap_route import router as weekly_recap_router
from app.sample_data import get_sample_plan
from app.schemas import (
    CheckInReceipt,
    CheckInRequest,
    TrainingPlan,
)
from app.plan_preview import (
    PlanPreviewRequest,
    PlanPreviewResponse,
    build_plan_preview,
)

app = FastAPI(
    title="Running Coach API",
    version="0.1.0",
    description="Training plans and runner feedback.",
)

app.include_router(weekly_recap_router)
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/api/v1/plans/sample",
    response_model=TrainingPlan,
    response_model_by_alias=True,
)
def read_sample_plan() -> TrainingPlan:
    return get_sample_plan()

@app.post(
    "/api/v1/check-ins",
    response_model=CheckInReceipt,
)
def receive_check_in(check_in: CheckInRequest) -> CheckInReceipt:
    return CheckInReceipt(
        status="received",
        persisted=False,
        date=check_in.date,
    )

@app.post(
    "/api/v1/plans/preview",
    response_model=PlanPreviewResponse,
    response_model_by_alias=True,
)
def preview_plan(request: PlanPreviewRequest):
    return build_plan_preview(request)