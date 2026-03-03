# RMDI Phase 1 Technical Spec
## For Codex Build — March 2, 2026

---

## Overview

Build the foundation for Rocky Mountain Dental Implants surgical guide planning platform.

**Deadline:** Must be testable by March 9, 2026 (pilot meeting with Dr. Steven Tobler)

**Repository:** `~/clawd/projects/rmdi/website`
**Framework:** Astro
**Hosting:** Cloudflare Pages
**Backend:** Cloudflare Workers (or Node.js API routes in Astro)

---

## Phase 1 Deliverables

### 1. Foundation Setup

#### 1.1 Add Tailwind CSS
- Install and configure Tailwind
- Set up `tailwind.config.js` with dental/medical color palette:
  - Primary: Blue (#1d4ed8)
  - Secondary: Slate grays
  - Accent: Green for success states
- Configure for Astro integration

#### 1.2 Component Library
Create reusable components in `src/components/`:

```
src/components/
├── Header.astro          # Nav with logo, links
├── Footer.astro          # Contact info, links
├── Button.astro          # Primary/secondary variants
├── Card.astro            # Content cards
├── FormField.astro       # Label + input wrapper
├── Alert.astro           # Success/error/warning messages
└── Layout.astro          # Base page layout
```

#### 1.3 Project Structure
```
src/
├── components/           # Reusable UI components
├── layouts/
│   └── BaseLayout.astro  # HTML wrapper, head, meta
├── pages/
│   ├── index.astro       # Homepage
│   ├── services.astro    # Service offerings + pricing
│   ├── submit-case.astro # Step 1: Intake form
│   ├── upload/[token].astro  # Step 2: File upload page
│   └── api/              # API routes
│       ├── submit-case.ts
│       ├── upload.ts
│       ├── availability.ts
│       └── services.ts
├── lib/
│   ├── db.ts             # Database helpers
│   ├── email.ts          # Email sending
│   ├── calendar.ts       # Google Calendar integration
│   └── utils.ts          # Utilities
└── styles/
    └── global.css        # Tailwind imports + custom styles
```

---

### 2. Two-Step Intake Form

#### 2.1 Step 1: Case Details (`/submit-case`)

**Form Fields:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Doctor name | text | ✅ | min 2 chars |
| Practice name | text | ✅ | min 2 chars |
| Email | email | ✅ | valid email |
| Phone | tel | ❌ | optional |
| Tooth number(s) | multi-select | ✅ | Universal 1-32, checkboxes |
| Implant system | select | ✅ | Nobel, Straumann, Zimmer, BioHorizons, Other |
| Date needed by | date | ✅ | must be future date |
| Preferred review slot | calendar picker | ✅ | shows available 15-min slots |
| Lab delivery | radio | ✅ | See options below |
| Notes | textarea | ❌ | max 1000 chars |
| Disclaimer | checkbox | ✅ | must be checked |

**Lab Delivery Options (radio group):**
```
○ Send STL back to me for local production
○ Send to partner lab:
    - Newcraft Dental Arts
    - Bio Aesthetic Dental Studio
○ Send to my lab:
    Lab name: [________]
    Lab email: [________]
```

**Disclaimer text:**
> "I confirm these files have been de-identified and contain no patient name, date of birth, or other identifying information."

**On Submit:**
1. Validate all fields
2. Generate unique case ID: `RMDI-[LASTNAME]-[TOOTH]-[YYMMDD]-[SEQ]`
3. Generate unique upload token (UUID)
4. Save case to database (status: "pending_upload")
5. Book calendar slot
6. Send confirmation email to doctor with upload link
7. Send alert email to info@rockymountaindentalimplants.com
8. Show success message with case ID

#### 2.2 Step 2: File Upload (`/upload/[token]`)

**Page shows:**
- Case summary (doctor, teeth, date needed)
- Instructions for de-identifying files
- Two file upload sections:

**CBCT Upload (DICOM):**
- Accept: folder or .zip containing .dcm files
- OR: URL field for shared link (Dropbox/Drive/OneDrive)
- Size limit note: "For files over 500MB, please use a shared link"

**STL Upload (Intraoral Scan):**
- Accept: .stl file upload
- OR: URL field for shared link
- Size limit: up to 100MB direct upload

**On Complete:**
1. Update case status to "files_received"
2. Send notification to info@rockymountaindentalimplants.com
3. Show confirmation: "Files received! We'll review and contact you for your scheduled consultation."

---

### 3. Calendar Integration

#### 3.1 Read Availability
- Connect to Google Calendar API
- Calendar: artoobeeptoo@gmail.com (primary)
- Fetch busy times for next 14 days
- Generate available 15-minute slots:
  - Monday-Friday only
  - 8:00 AM - 5:00 PM Mountain Time
  - Exclude busy blocks

#### 3.2 Book Slot
- When form submitted, create calendar event
- Event title: `RMDI Case Review: Dr. [Name] - #[Tooth]`
- Event description: Include case ID, contact info
- Invite: Doctor's email + info@rockymountaindentalimplants.com
- Add Zoom link (or note to add manually for now)

#### 3.3 Calendar Picker Component
- Show available slots grouped by day
- Mobile-friendly (scrollable list)
- Real-time availability check

---

### 4. Email Notifications

Use Gmail API (already configured) with sender: `info@rockymountaindentalimplants.com`

#### 4.1 Confirmation to Doctor (after Step 1)
```
Subject: RMDI Case Received - [CASE_ID]

Hi Dr. [Name],

Thank you for submitting your case to Rocky Mountain Dental Implants.

Case ID: [CASE_ID]
Teeth: #[TOOTH_NUMBERS]
Review scheduled: [DATE] at [TIME] MT

NEXT STEP: Upload your files
Please click the link below to upload your CBCT and STL files:
[UPLOAD_LINK]

Important: Files must be de-identified (no patient name or DOB).

Questions? Reply to this email.

- Rocky Mountain Dental Implants
```

#### 4.2 Alert to RMDI (after Step 1)
```
Subject: New Case Submitted - [CASE_ID]

New case from Dr. [Name] at [Practice]

Case ID: [CASE_ID]
Teeth: #[TOOTH_NUMBERS]
Date needed: [DATE]
Review scheduled: [DATETIME]
Lab delivery: [OPTION]

Awaiting file upload.
Upload link: [UPLOAD_LINK]

Doctor contact: [EMAIL] / [PHONE]
```

#### 4.3 Files Received Alert (after Step 2)
```
Subject: Files Received - [CASE_ID]

Files uploaded for case [CASE_ID]

Doctor: Dr. [Name]
Teeth: #[TOOTH_NUMBERS]
Review: [DATETIME]

CBCT: [link or "direct upload"]
STL: [link or "direct upload"]

Ready for planning.
```

---

### 5. Database Schema

Use Cloudflare D1 (SQLite) or simple JSON file storage for MVP.

#### Cases Table
```sql
CREATE TABLE cases (
  id TEXT PRIMARY KEY,           -- RMDI-SMITH-14-260302-001
  upload_token TEXT UNIQUE,      -- UUID for upload link
  doctor_name TEXT NOT NULL,
  practice_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  tooth_numbers TEXT NOT NULL,   -- JSON array: [14, 15]
  implant_system TEXT NOT NULL,
  date_needed DATE NOT NULL,
  review_datetime DATETIME,
  calendar_event_id TEXT,
  lab_delivery_option TEXT,      -- "self" | "partner" | "custom"
  lab_name TEXT,                 -- if custom
  lab_email TEXT,                -- if custom
  partner_lab TEXT,              -- if partner: "newcraft" | "bioaesthetic"
  notes TEXT,
  cbct_link TEXT,
  stl_link TEXT,
  status TEXT DEFAULT 'pending_upload',  -- pending_upload, files_received, planning, review_scheduled, completed, delivered
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 6. GEO Optimization (Agent-Friendly)

#### 6.1 llms.txt
Create `public/llms.txt`:
```
# Rocky Mountain Dental Implants
> Surgical guide planning services for dental labs and restoring doctors

## Services
- Surgical guide planning: $75-100/case (Nobel customers get discount)
- CBCT + STL case review
- 15-minute virtual consultations
- Turnaround: 48-72 hours standard, 24 hours expedited

## Specialties
- Nobel Biocare
- Straumann
- Zimmer Biomet
- BioHorizons
- All major implant systems

## Service Area
- Colorado, Utah, Wyoming (primary)
- Remote services available nationwide

## Contact
- Email: info@rockymountaindentalimplants.com
- Web: https://rockymountaindentalimplants.com

## For AI Agents
- Submit case: POST /api/submit-case
- Check availability: GET /api/availability
- Service info: GET /api/services
```

#### 6.2 Structured Data (JSON-LD)
Add to BaseLayout.astro `<head>`:
```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Rocky Mountain Dental Implants",
  "description": "Surgical guide planning services for dental labs and restoring doctors",
  "url": "https://rockymountaindentalimplants.com",
  "email": "info@rockymountaindentalimplants.com",
  "areaServed": ["Colorado", "Utah", "Wyoming"],
  "serviceType": ["Surgical Guide Planning", "Implant Case Planning", "CBCT Analysis"],
  "priceRange": "$75-$150"
}
```

#### 6.3 API Endpoints
Create `/api/services.ts`:
```typescript
export async function GET() {
  return new Response(JSON.stringify({
    services: [
      {
        name: "Surgical Guide Planning",
        price: { standard: 100, nobel_discount: 75 },
        turnaround: "48-72 hours",
        includes: ["CBCT review", "Implant positioning", "STL export", "15-min consultation"]
      }
    ],
    contact: {
      email: "info@rockymountaindentalimplants.com"
    },
    availability_endpoint: "/api/availability"
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
```

Create `/api/availability.ts`:
```typescript
// Returns available 15-min slots for next 14 days
export async function GET() {
  // Integrate with Google Calendar
  // Return available slots as JSON
}
```

---

### 7. Pages to Build/Update

#### 7.1 Homepage (`/`)
- Hero: "AI-Powered Surgical Guide Planning"
- Value props: Fast, affordable, expert review
- CTA: "Submit a Case" → /submit-case
- Trust signals: "Nobel Biocare Expert", "48-72 Hour Turnaround"

#### 7.2 Services (`/services`)
- Pricing table (already created, enhance)
- Process overview
- FAQ section

#### 7.3 Submit Case (`/submit-case`)
- Full intake form as specified above

#### 7.4 Upload (`/upload/[token]`)
- File upload interface
- Instructions
- Progress indicators

---

## Configuration Required

### Environment Variables
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GMAIL_SEND_AS=info@rockymountaindentalimplants.com

# If using Cloudflare D1
D1_DATABASE_ID=

# If using external DB
DATABASE_URL=
```

### Google Calendar Scopes Needed
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events`

### Gmail Scopes Needed
- `https://www.googleapis.com/auth/gmail.send`

---

## Testing Checklist

- [ ] Form validates all required fields
- [ ] Form rejects past dates for "date needed"
- [ ] Calendar shows only available slots
- [ ] Calendar books slot and creates event
- [ ] Upload link works and accepts files
- [ ] Emails send with correct content
- [ ] Case ID format is correct
- [ ] Database stores all case data
- [ ] Mobile responsive
- [ ] llms.txt accessible
- [ ] API endpoints return valid JSON

---

## Notes for Codex

1. **Start with foundation** — Tailwind, components, structure before forms
2. **Use existing Google auth** — Token at `~/.secrets/google-token.json`
3. **Gmail sending works** — See `~/clawd/scripts/gmail-*.py` for reference
4. **Keep it simple** — SQLite/JSON file storage is fine for MVP
5. **Mobile first** — Many doctors will start forms on phone
6. **Notify on completion** — Run: `openclaw system event --text "RMDI Phase 1 Complete" --mode now`

---

*Spec version: 1.0 | Created: 2026-03-02*
