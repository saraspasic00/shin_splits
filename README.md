# Shin Splits

*Running plans that take you into account.*

## About

Shin Splits is a running coach application designed to help people start running, build consistency, return to running after a break, or prepare for a race.

As a runner myself, I wanted to build something that takes into account not just how much someone runs, but also how they feel and how running fits into their everyday life.

The idea is to move away from rigid, one-size-fits-all training plans towards a more personalised and adaptive coaching experience, accessible to runners with or without a sports watch.

## Current features

- **Personalised onboarding** — Collects running experience, goals, recent training history, availability and time constraints.
- **Individual training plans** — Generates structured running and rest days based on the runner's profile and current training capacity.
- **Run logging** — Records completed or skipped sessions, actual duration, perceived effort and personal feedback.
- **Daily check-ins** — Tracks sleep and energy levels.
- **Weekly recaps** — Summarises training activity and compares planned sessions with completed runs.
- **Personal dashboard** — Displays upcoming sessions, weekly schedules and running history through a responsive interface.

## AI & Engineering Approach

The current planning engine uses deterministic rules to establish a reliable training baseline, taking into account session duration, weekly training volume and available running days.

The next stage introduces an LLM-based coaching layer that interprets training history, perceived effort and recovery to recommend adjustments to future training plans.

Rather than relying entirely on an LLM to generate training plans, the approach combines:

- Rule-based training constraints
- Structured LLM outputs
- Input and output validation
- Historical training data
- Continuous evaluation of recommendations

The objective is to build an AI coaching system that produces reliable, explainable and context-aware recommendations.

## Roadmap

- [ ] Adaptive weekly training plans based on individual progress and feedback.
- [ ] Personalised AI-generated coaching recommendations and weekly explanations.
- [ ] Integration with running platforms such as Strava and Suunto.
- [ ] Optional menstrual cycle tracking to explore individual recovery patterns and training needs.
- [ ] Extended race preparation for half-marathon and marathon distances.
- [ ] Training analytics and long-term progress visualisation.
- [ ] Automated evaluation of AI-generated recommendations.
- [ ] Real-world user testing and feedback-driven improvements.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | Python, FastAPI |
| Database & Authentication | Supabase, PostgreSQL |
| Data Validation | Pydantic, Zod |
| Automation | GitHub Actions |
| AI Coaching | LLM integration — planned |

## Project Status

Shin Splits is an independent project in active development, combining my background in software engineering and artificial intelligence with my personal interest in running.

The long-term goal is to develop a reliable running companion that evolves alongside its users, with recommendations grounded in real training data and individual feedback.
