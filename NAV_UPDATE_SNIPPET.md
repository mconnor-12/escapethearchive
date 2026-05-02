# Navigation Update — Add to memory.html

To wire up the new pages, add this nav bar to the TOP of your `memory.html`
(right after the opening `<body>` tag, before your existing header):

```html
<nav style="background:#1a1208; padding:0 1.5rem; display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #8b3a2a; position:sticky; top:0; z-index:9999;">
  <span style="font-family:'Playfair Display',serif; color:#f5f0e8; padding:0.8rem 0; font-size:1rem; letter-spacing:0.02em;">
    Escape the <span style="color:#d4ad3a;">Archive</span>
  </span>
  <div style="display:flex; gap:0;">
    <a href="memory.html" style="color:#ede5d4; text-decoration:none; padding:0.8rem 1rem; font-size:0.78rem; letter-spacing:0.06em; text-transform:uppercase; font-weight:600; font-family:sans-serif;">Play</a>
    <a href="about.html" style="color:#ede5d4; text-decoration:none; padding:0.8rem 1rem; font-size:0.78rem; letter-spacing:0.06em; text-transform:uppercase; font-weight:600; font-family:sans-serif;">About</a>
    <a href="contribute.html" style="color:#d4ad3a; text-decoration:none; padding:0.8rem 1rem; font-size:0.78rem; letter-spacing:0.06em; text-transform:uppercase; font-weight:600; font-family:sans-serif; border:1px solid rgba(212,173,58,0.4);">Contribute</a>
  </div>
</nav>
```

Also add this Playfair Display import to your `<head>` if it's not there already:
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap" rel="stylesheet">
```

---

# Apps Script — Integration Steps

## Step 1: Create new file
In your existing Apps Script project:
- File → New → Script file
- Name it: `contributions`
- Paste the entire `contributions_appsscript.gs` file there

## Step 2: Update doPost in Code.gs
Find your `doPost(e)` function and add these lines right after you parse the JSON:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ADD THESE TWO LINES:
    if (data.action === 'contribute') { return handleContribution(data); }
    if (data.action === 'contact')    { return handleContact(data); }

    // ... rest of your existing doPost logic
  }
}
```

## Step 3: Run setup once
In Apps Script, select the function `setupContributionSheets` and click Run.
This creates the "Contributions" and "Contact Messages" tabs in your Sheet.

## Step 4: Deploy
Re-deploy your web app (Deploy → Manage deployments → edit → Deploy).
The URL stays the same — no changes needed in the HTML files.

---

# New Sheet Tabs Created

**Contributions** tab columns:
- Submitted At, Review Status (pending/approved/rejected dropdown), Source Type,
  Source Type (Other), Source Title, Date of Origin, Place of Origin,
  Source Description/Transcription, Source URL, Temporal Tags, Thematic Tags,
  Contributor Name, Contributor Email, Contributor Role, Contributor Institution,
  Credit Preference, Original Creator Name, Original Creator Role,
  Current Holder/Location, Usage Rights, Archival Note, Related Sources,
  Suggested Grade Level, Content Notes, Internal Notes (admin only)

**Contact Messages** tab columns:
- Timestamp, Name, Email, Role, Subject, Message, Responded?

Review Status cells are color-coded automatically:
- 🟡 Yellow = pending
- 🟢 Green = approved  
- 🔴 Red = rejected
