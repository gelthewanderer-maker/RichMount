# Richmount IELTS Studio

An original IELTS Academic practice hub for Teacher Angelo’s Richmount learners, with the supplied Richmount education center logo.

## Render deployment

This project contains only the website, verification scripts and Render configuration. It has no external API dependencies or secrets. Deploy as a Static Site using the `main` branch, build command `npm run check && npm test`, and publish directory `dist`. Set `SKIP_INSTALL_DEPS=true`; there are no dependencies to install. Static hosting uses the provider's free tier and workspace usage allowances.

The included `render.yaml` is an alternative Blueprint configuration. For a single site, direct creation is sufficient.

## Features and limits

- Writing prompts and post-submission common-error grammar checks.
- 3 reading passages with 40 automatically marked questions.
- 4 listening parts with 40 questions, synthetic speech and session-local teacher audio uploads.
- Speaking prompts and local recordings, guides, timers, saved drafts, report downloads and a timed mock sequence.

Grammar checks are deterministic, not AI evaluation or IELTS band scoring. Listening tracks are shorter than official recordings. Speaking is self-reviewed. All learner drafts and results remain in the visitor's browser; the teacher receives only reports that learners choose to send. Answer keys are client-side, so the mock is a practice simulation rather than a secure examination.

## Local checks

Run `npm run check` and `npm test`. Browser visual and audio QA was unavailable in the authoring environment.
