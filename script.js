const PLACEHOLDER_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxuDmSuBp6Vx2U8Pr63S39Ja0W-RAccMZOQPNlF_7wx1FCaF87aRCSia0M9bU8WaCFL/exec";
const PLACEHOLDER_SHEET_URL = "https://docs.google.com/spreadsheets/d/AKfycbxuDmSuBp6Vx2U8Pr63S39Ja0W-RAccMZOQPNlF_7wx1FCaF87aRCSia0M9bU8WaCFL/edit";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUWnMvenrlnY2Y86-bx_IgSNYeTX4oUImxA8wGAM91XMqhriB6DM_SI_RV-gA_qz9W/exec";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1gbQGrZU3GEtFkxQHUb3WyX81O648u2Y3fh4ukxP5knA/edit";
const LOCAL_STORAGE_KEY = "expenseTrackerData";

const form = document.getElementById("expenseForm");
const expenseList = document.getElementById("expenseList");
const totalElement = document.getElementById("total");
const clearAllBtn = document.getElementById("clearAllBtn");
const sheetsBtn = document.getElementById("sheetsBtn");
const statusElement = document.getElementById("status");
const summaryElement = document.getElementById("summary");
const participants = ["Sokin", "Sachin", "Arshad"];

// Simple client-side access control (offline-friendly)
// NOTE: This is a lightweight gate for convenience. It is not a secure auth method.
const ACCESS_PIN = "1234"; // change this to a secret you share with the 3 people
let currentUser = sessionStorage.getItem("expenseTrackerUser") || null;
let readOnlyMode = false;
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
let inactivityTimer = null;

function signOut() {
    currentUser = null;
    readOnlyMode = false;
    sessionStorage.removeItem("expenseTrackerUser");
    setStatus("Signed out after 2 minutes of inactivity.", "status-warning");
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (!currentUser) {
        inactivityTimer = null;
        return;
    }

    inactivityTimer = setTimeout(() => {
        signOut();
    }, INACTIVITY_TIMEOUT_MS);
}

function handleUserActivity() {
    if (currentUser) {
        resetInactivityTimer();
    }
}

function signInPrompt() {
    const names = participants.join(", ");
    const name = prompt(`Enter your name (one of: ${names}) to sign in, or Cancel for read-only:`);
    if (!name) {
        readOnlyMode = true;
        setStatus("Read-only: sign in to enable adding/syncing.", "status-warning");
        return false;
    }

    if (!participants.includes(name)) {
        alert("Name not recognised. Only the three permitted users may sign in.");
        return signInPrompt();
    }

    const pin = prompt("Enter access PIN:");
    if (pin === ACCESS_PIN) {
        currentUser = name;
        sessionStorage.setItem("expenseTrackerUser", currentUser);
        readOnlyMode = false;
        setStatus(`Signed in as ${currentUser}.`, "status-ok");
        resetInactivityTimer();
        return true;
    }

    alert("Incorrect PIN. Try again.");
    return signInPrompt();
}

function ensureAuthenticated() {
    if (currentUser) {
        resetInactivityTimer();
        return true;
    }
    return signInPrompt();
}
let expenses = [];
let statusOverride = null;

function isGoogleSheetsConfigured() {
    return GOOGLE_SCRIPT_URL !== PLACEHOLDER_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes("AKfycbxuDmSuBp6Vx2U8Pr63S39Ja0W-RAccMZOQPNlF_7wx1FCaF87aRCSia0M9bU8WaCFL");
}

function isSheetUrlConfigured() {
    return SHEET_URL !== PLACEHOLDER_SHEET_URL && !SHEET_URL.includes("AKfycbxuDmSuBp6Vx2U8Pr63S39Ja0W-RAccMZOQPNlF_7wx1FCaF87aRCSia0M9bU8WaCFL");
}

function setStatus(message, className) {
    statusOverride = { message, className };
    statusElement.textContent = message;
    statusElement.className = `status-banner ${className}`;
}

function saveExpensesToLocal() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(expenses));
}

function loadExpensesFromLocal() {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
        try {
            expenses = JSON.parse(saved);
        } catch (error) {
            console.error("Failed to parse local expenses:", error);
            expenses = [];
        }
    }
}

function sendToGoogleSheets(expense) {
    if (!isGoogleSheetsConfigured()) {
        return;
    }

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(expense)
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success" && data.id) {
            expense.id = data.id;
            saveExpensesToLocal();
            setStatus("Expense synced to Google Sheets ✅", "status-ok");
            console.log("Expense saved to Google Sheets with id", data.id);
        } else {
            setStatus("Google Sheets sync failed: invalid response.", "status-warning");
            console.warn("Google Sheets reply did not return an id", data);
        }
    })
    .catch(error => {
        setStatus("Google Sheets sync failed. Check the browser console.", "status-warning");
        console.error("Error sending to Google Sheets:", error);
    });
}
function syncPendingExpenses() {
    const pendingExpenses = expenses.filter(exp => exp.id.startsWith("LOCAL_"));
    
    if (pendingExpenses.length === 0) {
        return;
    }

    if (!isGoogleSheetsConfigured()) {
        return;
    }

    setStatus(`Syncing ${pendingExpenses.length} offline expense(s) to Google Sheets...`, "status-ok");
    console.log("Auto-syncing pending expenses...");

    let synced = 0;
    pendingExpenses.forEach(expense => {
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(expense)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === "success" && data.id) {
                expense.id = data.id;
                synced++;
                saveExpensesToLocal();
                
                if (synced === pendingExpenses.length) {
                    setStatus(`All offline expenses synced to Google Sheets! ✅`, "status-ok");
                    console.log("All pending expenses synced successfully");
                }
            }
        })
        .catch(error => {
            console.error("Error syncing pending expense:", error);
        });
    });
}
function loadFromGoogleSheets() {
    updateStatus();

    if (!isGoogleSheetsConfigured()) {
        loadExpensesFromLocal();
        renderExpenses();
        return;
    }

    fetch(GOOGLE_SCRIPT_URL, {
        mode: "cors"
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === "success" && Array.isArray(data.expenses)) {
                expenses = data.expenses || [];
                setStatus("Loaded expenses from Google Sheets ✅", "status-ok");
            } else {
                setStatus("Google Sheets load failed: unexpected response.", "status-warning");
                console.warn("Unexpected Google Sheets response:", data);
                expenses = [];
            }
            saveExpensesToLocal();
            renderExpenses();
        })
        .catch(error => {
            setStatus("Google Sheets load failed. Check the browser console.", "status-warning");
            console.error("Error loading expenses from Google Sheets:", error);
            loadExpensesFromLocal();
            renderExpenses();
        });
}

function updateStatus() {
    if (statusOverride) {
        statusElement.textContent = statusOverride.message;
        statusElement.className = `status-banner ${statusOverride.className}`;
        return;
    }

    if (isGoogleSheetsConfigured()) {
        if (isSheetUrlConfigured()) {
            statusElement.textContent = "Google Sheets sync is enabled ✅";
            statusElement.className = "status-banner status-ok";
        } else {
            statusElement.textContent = "Apps Script configured, but the Google Sheet URL is not set in script.js.";
            statusElement.className = "status-banner status-warning";
        }
        return;
    }

    if (isSheetUrlConfigured()) {
        statusElement.textContent = "Google Sheet URL is set, but Apps Script URL is not configured.";
        statusElement.className = "status-banner status-warning";
        return;
    }

    statusElement.textContent = "Google Sheets is not configured. Local save only.";
    statusElement.className = "status-banner status-warning";
}

function renderSummary() {
    if (expenses.length === 0) {
        summaryElement.textContent = "No expenses yet. Add one to see the per-person summary.";
        return;
    }

    const totals = participants.reduce((acc, person) => {
        acc[person] = 0;
        return acc;
    }, {});

    expenses.forEach(expense => {
        totals[expense.paidBy] = (totals[expense.paidBy] || 0) + expense.amount;
    });

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const share = total / participants.length;

    const lines = participants.map(person => {
        const paid = totals[person] || 0;
        const diff = paid - share;
        const status = diff === 0
            ? "even"
            : diff > 0
                ? `gets ₹${diff.toFixed(2)}`
                : `owes ₹${Math.abs(diff).toFixed(2)}`;
        return `${person}: paid ₹${paid.toFixed(2)} (${status})`;
    });

    summaryElement.innerHTML = `
        <strong>Per-person totals:</strong><br>
        ${lines.join("<br>")}<br>
        <strong>Equal share:</strong> ₹${share.toFixed(2)}
    `;
}

form.addEventListener("submit", function(e) {
    e.preventDefault();
    if (!ensureAuthenticated()) return;
    if (readOnlyMode) { alert("You are in read-only mode. Sign in to add expenses."); return; }

    const title = document.getElementById("title").value.trim();
    const amount = Number(document.getElementById("amount").value);
    const paidBy = document.getElementById("paidBy").value;

    if (!title || isNaN(amount) || amount <= 0) {
        alert("Please enter a valid expense name and amount.");
        return;
    }

    const expense = {
        id: `LOCAL_${Date.now()}`,
        title,
        amount,
        paidBy,
        date: new Date().toLocaleString()
    };

    expenses.push(expense);
    saveExpensesToLocal();
    renderExpenses();
    sendToGoogleSheets(expense);
    form.reset();
});

clearAllBtn.addEventListener("click", function() {
    if (!ensureAuthenticated()) return;
    if (readOnlyMode) { alert("You are in read-only mode. Sign in to clear expenses."); return; }

    if (expenses.length === 0) {
        alert("There are no expenses to clear.");
        return;
    }

    if (confirm("Are you sure you want to delete all expenses?")) {
        expenses = [];
        saveExpensesToLocal();

        if (isGoogleSheetsConfigured()) {
            fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify({ action: "clearAll" })
            }).catch(error => console.error("Error clearing Google Sheet:", error));
        }

        renderExpenses();
    }
});

sheetsBtn.addEventListener("click", function() {
    if (!ensureAuthenticated()) return;
    if (readOnlyMode) { alert("You are in read-only mode. Sign in to open the sheet."); return; }

    if (isSheetUrlConfigured()) {
        window.open(SHEET_URL, "_blank");
        return;
    }

    if (isGoogleSheetsConfigured()) {
        alert("Google Sheets sync is configured, but the public sheet URL needs to be updated in script.js.");
        return;
    }

    alert(
        "Google Sheets is not configured yet.\n\n" +
        "1. Deploy your Apps Script and paste the deployment URL into script.js.\n" +
        "2. Replace YOUR_SHEET_ID in SHEET_URL with your Google Sheet ID.\n" +
        "3. Reload the page."
    );
});

function renderExpenses() {
    expenseList.innerHTML = "";
    let total = 0;

    if (expenses.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.textContent = "No expenses added yet.";
        emptyItem.style.justifyContent = "center";
        emptyItem.style.color = "#6b7280";
        expenseList.appendChild(emptyItem);
    }

    expenses.forEach(function(expense, index) {
        total += expense.amount;

        const li = document.createElement("li");
        const info = document.createElement("span");
        info.textContent = `${expense.date} — ${expense.title} — ₹${expense.amount.toFixed(2)} — ${expense.paidBy}`;

        li.appendChild(info);
        expenseList.appendChild(li);
    });

    totalElement.textContent = total.toFixed(2);
    renderSummary();
    updateStatus();
}

loadFromGoogleSheets();

if (currentUser) {
    setStatus(`Signed in as ${currentUser}.`, "status-ok");
    resetInactivityTimer();
}

// Track activity to auto sign out after 2 minutes of inactivity
["mousemove", "keydown", "mousedown", "touchstart"].forEach(eventType => {
    window.addEventListener(eventType, handleUserActivity);
});

// Auto-sync when coming back online
window.addEventListener("online", function() {
    console.log("Back online! Auto-syncing pending expenses...");
    syncPendingExpenses();
});

window.addEventListener("offline", function() {
    console.log("Offline detected. New expenses will be saved locally.");
    setStatus("You are offline. Expenses saved locally will sync when back online.", "status-warning");
});
