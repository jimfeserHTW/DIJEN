# StudyNix

An interactive, slide-style learning book for Docker and Docker Compose (React + Vite). Six chapters with quizzes and in-browser labs: a simulated Docker CLI, a Dockerfile builder and a Compose runner. Nothing is sent anywhere and no Docker install is needed to use it.

## Run with Docker Compose

    docker compose up --build      # http://localhost:8080

## Run locally

    npm install
    npm run dev                    # development
    npm test                       # simulator tests

## GitHub Pages

Push to `main`. `.github/workflows/pages.yml` tests, builds and deploys `dist/`. In the repository settings, set Pages > Source to "GitHub Actions". The build uses relative asset paths and hash routes, so it works under `/<repo>/` without any config.

## Adding content

Chapters, slides, labs and quiz questions live in `src/content.ts`.
