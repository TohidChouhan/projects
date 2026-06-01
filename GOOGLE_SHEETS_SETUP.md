# Google Sheets Real-Time Sync Setup

## Step 1: Create a Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new sheet named "Expense Tracker"
3. Set up columns:
   - A: Date
   - B: Expense Name
   - C: Amount
   - D: Paid By

## Step 2: Create Google Apps Script Backend
1. Open your Google Sheet
2. Click **Extensions → Apps Script**
3. **Delete** the default code and paste this:

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  
  if (data.action === "clearAll") {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).clearContent();
    return ContentService.createTextOutput("Cleared");
  }
  
  if (data.action === "deleteExpense") {
    const rowIndex = data.index + 2;
    sheet.deleteRow(rowIndex);
    return ContentService.createTextOutput("Deleted");
  }
  
  // Add new expense
  const date = data.date || new Date().toLocaleString();
  const row = [date, data.title, data.amount, data.paidBy];
  sheet.appendRow(row);
  
  return ContentService.createTextOutput("Success");
}

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  const expenses = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      expenses.push({
        date: data[i][0],
        title: data[i][1],
        amount: data[i][2],
        paidBy: data[i][3]
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({expenses: expenses}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Step 3: Deploy as Web App
1. Click **Deploy → New deployment**
2. Select type: **Web app**
3. Execute as: **Your email**
4. Allow access to: **Anyone**
5. Click **Deploy**
6. Copy the deployment URL (looks like: `https://script.google.com/macros/d/...`)

## Step 4: Update Your Code
1. Open `script.js` in your expense tracker
2. Replace line 1:
   ```javascript
   const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/d/YOUR_DEPLOYMENT_ID/usercontent";
   ```
   With your actual deployment URL

3. Update the "📊 Open in Google Sheets" message with your sheet URL:
   - Find line: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID`
   - Replace `YOUR_SHEET_ID` with your sheet's ID (from the sheet URL)

## Step 5: Share with Team
1. Open your Google Sheet
2. Click **Share** (top right)
3. Add emails for Sachin and Arshad
4. Give them **Editor** access
5. Send them the expense tracker HTML file

## ✅ Done!
- All 3 of you can now use the tracker
- Data syncs automatically to Google Sheets
- Every expense is logged with timestamp
- All changes are visible to everyone in real-time
