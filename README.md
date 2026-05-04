# Re:Source | Questioning Neutrality

**A teacher-facing audit tool built from five years of source coding, item analysis, and student cohort data at Dream Charter High School in the Bronx.**

Re:Source makes the New York State Regents apparatus visible at the classroom level so teachers can interrupt it at the classroom level.

---

## What this repo contains

| File | Purpose |
|------|---------|
| `index.html` | The full Re:Source web app (single-file, no build step) |
| `corpus.js` | ES module export of all coded primary sources (for external use) |
| `sources.json` | Raw JSON corpus — all sources with all analytic fields |
| `ReSource_CritQuant.gs` | Google Apps Script to wire the app to the CritQuant Sheet |
| `README.md` | This file |

---

## The tool

Re:Source has seven tabs:

- **Home** — mission, vision, key data, what the tool does
- **Audit Assessment** — three-step source coding tool returning a four-dimension reading and classroom implication
- **Our Research** — methodology, data sources, analytic decisions
- **Our Findings** — four sub-questions with click-through detail views
- **Source Library** — 154+ coded primary sources, full filter and search, click any source to see its complete four-dimension reading
- **My Dashboard** — audit history, corpus breakdown, session stats
- **Make Assessment** — build a source set for a unit
- **Contribute** — submit an archival source or modern event document; appears immediately with a Pending badge

---

## The corpus

All sources are coded across four dimensions drawn from the dissertation's source-voice analysis framework:

| Dimension | Options |
|-----------|---------|
| **Power relation** | Resists / Navigates / Constructs / Maintains / Obscures |
| **Voice authenticity** | Direct / Mediated / Composite / Institutional |
| **Gaze direction** | Upward / Downward / Outward / Inward |
| **Schema burden** | Low / Moderate / High |

Additional fields per source: `id`, `title`, `author`, `year`, `excerpt`, `type`, `region`, `period`, `exam` (USH or GHG).

---

## Connecting to the CritQuant Google Sheet

### One-time setup

1. Open the CritQuant Sheet.
2. Go to **Extensions > Apps Script**.
3. Paste the contents of `ReSource_CritQuant.gs`, replacing any existing code.
4. Run `setupTabs()` once from the editor. This creates: Source Library, Submissions, Modern Events, Pending Review, and Sync Log tabs.
5. Deploy as a **Web App**: Deploy > New Deployment, execute as Me, access Anyone.
6. Copy the Web App URL.
7. In `index.html`, find `SHEET_CONFIG.webAppUrl` and paste the URL.

### How sync works

- The **Sync with CritQuant Sheet** button in the library pulls the Source Library tab as CSV and merges with the local corpus.
- Submissions from the Contribute tab POST to the Apps Script, which logs them to the Submissions or Modern Events tab.
- Approved sources are promoted to Source Library via `approveSubmission()` in the script.
- A **Re:Source Admin** custom menu appears in the sheet with shortcuts to setup, pending count, and site link.

### Sheet column order (Source Library tab)

`Title | Author | Year | Excerpt | Source Type | Power | Voice | Gaze | Schema | Region | Notes | Status`

The sync parser accepts lowercase and common aliases (e.g., `power relation` for `power`).

---

## Style rules

All prose in this tool follows the dissertation style rules:

- No em-dashes anywhere
- No semicolons in prose
- Asset-based framing throughout
- "This project" not "this study"

---

## Corpus coverage

| Exam | Count |
|------|-------|
| U.S. History (USH) | ~97 sources |
| Global History II (GHG) | ~57 sources |

| Power relation | Approximate % |
|----------------|--------------|
| Resists | 42% |
| Constructs | 32% |
| Navigates | 10% |
| Maintains | 8% |
| Obscures | 8% |

---

## Research context

Re:Source is the practitioner-facing tool built from the dissertation *Questioning Neutrality: Re:Source* (Marie Connor, Teachers College, Columbia University, Curriculum and Teaching Department). The research analyzes the NYS Regents in U.S. History and Geography II and Global History through frameworks including rubric architecture, item response theory, schema burden, source-voice analysis, and distractor patterns, using cohort data from Dream Charter High School.

---

## License

Research and tool developed by Marie Connor. Contact via the Teachers College, Columbia University Curriculum and Teaching Department.
