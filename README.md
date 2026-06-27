# Postfarm

Postfarm is a local-first content automation workspace for generating, organizing, previewing, and scheduling social posts.

It is designed for creators, small teams, and brands who want a self-run workflow: your projects, media, drafts, plans, and settings live on your own machine, and external services are used only when you configure them.

## Attribution

Postfarm is an upgraded and expanded version inspired by the original [SlideSmith](https://github.com/athcagithub/SlideSmith) project by [athcagithub](https://github.com/athcagithub). Full credit to the original project and its creator.

This public Postfarm version is maintained by [Jet](https://github.com/setjet).

## What Postfarm Does

Postfarm brings the main parts of a social content workflow into one local app:

| Area | What it does |
| --- | --- |
| Generate | Create post ideas, captions, carousels, and optional text-note style posts with AI. |
| Organize | Keep drafts in a queue, group media into folders, and manage project-specific settings. |
| Preview | Review generated slides, captions, hashtags, quality warnings, and scheduling details before publishing. |
| Plan | Use the autopilot planner to draft content calendars from topics, formats, and posting windows. |
| Schedule | Send approved posts to Postbridge when you configure your own Postbridge API key. |
| Learn | Pull connected results and learning insights from your own linked accounts when configured. |

## Features

- AI-assisted post and carousel generation.
- Project and brand memory for niche, audience, style, and positioning.
- Topics, generation notes, and reusable hashtag strategy.
- Local media library with folders for images and videos.
- Queue, preview, edit, and quality-check workflow.
- Optional autopilot content planner.
- Schedule and draft management through Postbridge.
- Results and learning insights from connected analytics.
- Multi-provider AI support through OpenRouter and DeepSeek.
- Optional Apify research and scraping workflows.
- Local-first storage with API-key based integrations.

## Local-First Privacy

Postfarm stores user data on the device running the app. Projects, API keys, generated posts, plans, imported media, folders, trend cache, learning memory, and local settings are stored as local files outside the repository by default.

Postfarm does not include telemetry, product analytics, remote database sync, automatic cloud uploads, or a hosted backend.

Data only leaves your device when you take an action that requires a configured external service:

- AI generation, scoring, rewrites, and learning prompts use your selected AI provider.
- Apify is used only when you run scraping or research workflows.
- Postbridge is used only when you load connected accounts, upload media, schedule posts, create drafts, or sync analytics.

Your API keys belong to you. Keep them private and never commit them to Git.

## Requirements

- Node.js compatible with the Vite toolchain in this repo. The installed Vite version requires `^20.19.0 || >=22.12.0`.
- npm.
- Optional: FFmpeg and FFprobe for video rendering workflows.
- Optional API keys for OpenRouter, DeepSeek, Apify, and Postbridge, depending on which features you want to use.

## Installation

```bash
git clone <your-postfarm-repo-url>
cd postfarm
npm install
cp .env.example .env
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

The development command starts both the web app and the local API.

## Running Locally

```bash
npm run dev      # Vite web app + local API
npm run server   # local API only
npm run build    # TypeScript build + Vite production build
npm run preview  # preview the built web app
npm run lint     # ESLint
npm test         # Node test suite
```

For a production-style local run:

```bash
npm run build
npm start
```

By default:

- Web UI: `http://localhost:5173`
- Local API: `http://localhost:8787`

## Environment Variables And API Keys

The easiest setup is through the in-app Settings page. New users start with empty API key fields.

You can also use local environment variables. Use placeholders only in shared examples:

```bash
OPENROUTER_API_KEY=your_openrouter_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
APIFY_API_KEY=your_apify_key_here
POSTBRIDGE_API_KEY=your_postbridge_key_here
```

Additional local options:

```bash
POSTFARM_DIR=/path/to/postfarm-data
POSTFARM_FONT=/path/to/bold-font.ttf
FFMPEG_PATH=/path/to/ffmpeg
FFPROBE_PATH=/path/to/ffprobe
```

Supported services:

- OpenRouter: AI generation, scoring, rewrites, trends, and learning.
- DeepSeek: alternate AI provider for generation workflows.
- Apify: optional trend, image, and video research or scraping.
- Postbridge: connected accounts, drafts, scheduling, uploads, and analytics.

## Data Storage

Runtime data is stored outside the Git repository by default:

| OS | Default location |
| --- | --- |
| macOS | `~/Library/Application Support/Postfarm` |
| Windows | `%APPDATA%/Postfarm` |
| Linux | `~/.config/postfarm` |

The app creates missing local files and folders on first run. To reset local data, stop the app and remove the local Postfarm data directory for your operating system. This clears local projects, API keys, queue drafts, content plans, imported media, trend cache, folders, and learning memory. It does not delete anything from external services such as Postbridge.

## Git Safety

Do not commit private local data, including:

- `.env` files.
- Local stores such as `config.json`, `queue.json`, `plans.json`, `trends.json`, `results.json`, `learning.json`, `library.json`, `folders.json`, or `videos.json`.
- SQLite or database files.
- Imported, scraped, downloaded, or generated media.
- Exports, thumbnails, caches, logs, screenshots, analytics snapshots, or scheduled-content data.

The repository `.gitignore` is configured to protect these paths by default. If you add sample data, keep it fake, minimal, and clearly marked.

## Credits

- Original project: [SlideSmith](https://github.com/athcagithub/SlideSmith) by [athcagithub](https://github.com/athcagithub).
- Upgraded version: Postfarm by [Jet](https://github.com/setjet).

Thank you to the original SlideSmith author for the foundation this project builds on.

## License

See [LICENSE](LICENSE). Postfarm follows the original SlideSmith license terms.

The original SlideSmith repository uses the [PolyForm Noncommercial License 1.0.0](https://github.com/athcagithub/SlideSmith/blob/main/LICENSE). Review the upstream license terms before commercial use, redistribution, or relicensing.

Required notice from the original project: Copyright 2026 Slidesmith.

## Contributing

Contributions are welcome once the project owner finalizes the public release process.

1. Fork the repo.
2. Create a focused branch.
3. Keep local data, media, API keys, generated posts, analytics, and schedules out of commits.
4. Run `npm run lint`, `npm test`, and `npm run build`.
5. Submit a pull request with a clear summary.

## Disclaimer

Users are responsible for complying with platform rules, copyright law, and the terms of any services they connect. Imported, scraped, or generated media should be used responsibly. API providers may have their own pricing, rate limits, data policies, and usage terms.
