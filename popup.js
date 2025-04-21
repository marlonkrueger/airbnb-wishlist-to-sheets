/**
 * Airbnb Wishlist to Google Sheets Extension
 * Popup Script (popup.js)
 *
 * This script handles the extension popup UI interactions and coordinates
 * between the content script and background script.
 */

document.addEventListener("DOMContentLoaded", function () {
  console.log("Popup DOM loaded");

  // Initialize popup
  initializePopup();

  // Set up event listeners
  setupEventListeners();
});

/**
 * Initializes the popup by checking authentication status
 * and updating UI accordingly
 */
function initializePopup() {
  // Check if user is authenticated
  chrome.storage.local.get(
    ["token", "spreadsheetId", "spreadsheetUrl"],
    function (data) {
      if (chrome.runtime.lastError) {
        console.error("Storage error:", chrome.runtime.lastError);
        showStatus("Failed to access storage. Please try again.", "error");
        return;
      }

      console.log("Retrieved storage data:", Object.keys(data));

      if (data.token) {
        // User is authenticated
        updateUIForAuthenticatedUser(data);
      } else {
        // User is not authenticated
        updateUIForUnauthenticatedUser();
      }
    }
  );
}

/**
 * Updates the UI for an authenticated user
 * @param {Object} data - Storage data containing authentication and spreadsheet info
 */
function updateUIForAuthenticatedUser(data) {
  document.getElementById("loginStatus").style.display = "none";
  document.getElementById("extractionControls").style.display = "block";

  if (data.spreadsheetUrl) {
    document.getElementById("spreadsheetUrl").style.display = "block";
    // Store the URL for the button to use
    document
      .getElementById("openSpreadsheet")
      .setAttribute("data-url", data.spreadsheetUrl);
  }
}

/**
 * Updates the UI for an unauthenticated user
 */
function updateUIForUnauthenticatedUser() {
  document.getElementById("loginStatus").style.display = "block";
  document.getElementById("extractionControls").style.display = "none";
  document.getElementById("spreadsheetUrl").style.display = "none";
}

/**
 * Sets up all event listeners for the popup UI
 */
function setupEventListeners() {
  // Handle Open Spreadsheet button click
  document
    .getElementById("openSpreadsheet")
    .addEventListener("click", handleOpenSpreadsheetClick);

  // Handle Google authorization
  document
    .getElementById("authorize")
    .addEventListener("click", handleAuthorizeClick);

  // Handle wishlist data extraction
  document
    .getElementById("extract")
    .addEventListener("click", handleExtractClick);
}

/**
 * Handles click on the Open Spreadsheet button
 * @param {Event} event - The click event
 */
function handleOpenSpreadsheetClick(event) {
  const url = this.getAttribute("data-url");
  if (url) {
    chrome.tabs.create({ url: url });
  } else {
    showStatus(
      "No spreadsheet URL available. Please extract data first.",
      "error"
    );
  }
}

/**
 * Handles click on the Authorize button
 * @param {Event} event - The click event
 */
function handleAuthorizeClick(event) {
  console.log("Authorize button clicked");

  // Disable button to prevent multiple clicks
  const authorizeButton = document.getElementById("authorize");
  authorizeButton.disabled = true;
  authorizeButton.textContent = "Signing in...";

  // Send authorization request to background script
  chrome.runtime.sendMessage({ action: "authorize" }, function (response) {
    // Re-enable button
    authorizeButton.disabled = false;
    authorizeButton.textContent = "Sign in with Google";

    // Handle response
    console.log("Auth response received:", response);

    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError);
      showStatus(
        "Error connecting to Google: " + chrome.runtime.lastError.message,
        "error"
      );
      return;
    }

    if (response && response.success) {
      document.getElementById("loginStatus").style.display = "none";
      document.getElementById("extractionControls").style.display = "block";
      showStatus("Successfully signed in with Google", "success");
    } else {
      const errorMsg =
        response && response.error
          ? response.error
          : "Failed to sign in with Google";
      showStatus(errorMsg + ". Please try again.", "error");
    }
  });
}

/**
 * Handles click on the Extract button
 * @param {Event} event - The click event
 */
function handleExtractClick(event) {
  console.log("Extract button clicked");

  // Disable button to prevent multiple clicks
  const extractButton = document.getElementById("extract");
  extractButton.disabled = true;
  extractButton.textContent = "Extracting...";

  // Check if we're on an Airbnb wishlist page
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];
    const currentUrl = currentTab.url;
    console.log("Current URL:", currentUrl);

    // Check for errors
    if (chrome.runtime.lastError) {
      console.error("Error accessing tabs:", chrome.runtime.lastError);
      handleExtractError("Failed to access current tab. Please try again.");
      return;
    }

    // Check if we're on an Airbnb wishlist page
    if (!currentUrl.includes("/wishlists/")) {
      handleExtractError("Please navigate to an Airbnb wishlist page first");
      return;
    }

    showStatus("Extracting data from wishlist...", "success");

    // Proceed with extraction
    checkAndInjectContentScript(currentTab);
  });

  /**
   * Handles extraction errors and resets UI
   * @param {string} errorMessage - The error message to display
   */
  function handleExtractError(errorMessage) {
    showStatus(errorMessage, "error");
    extractButton.disabled = false;
    extractButton.textContent = "Extract Wishlist Data";
  }
}

/**
 * Checks if content script is loaded and injects it if necessary
 * @param {Object} tab - The current tab
 */
function checkAndInjectContentScript(tab) {
  try {
    // Check if content script is already injected
    chrome.tabs.sendMessage(
      tab.id,
      { action: "ping" },
      function (pingResponse) {
        const hasError = chrome.runtime.lastError;

        if (hasError) {
          console.log("Content script not ready:", chrome.runtime.lastError);
          injectContentScript(tab);
        } else {
          // Content script is already loaded, proceed with extraction
          console.log("Content script is ready, proceeding with extraction");
          extractWishlistData(tab.id);
        }
      }
    );
  } catch (e) {
    console.error("Error checking content script:", e);
    showStatus("Error initializing extraction: " + e.message, "error");
    resetExtractButton();
  }
}

/**
 * Injects the content script into the current tab
 * @param {Object} tab - The current tab
 */
function injectContentScript(tab) {
  console.log("Injecting content script");

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      files: ["content.js"],
    },
    function () {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to inject content script:",
          chrome.runtime.lastError
        );
        showStatus(
          "Failed to initialize data extraction. Please refresh the page and try again.",
          "error"
        );
        resetExtractButton();
        return;
      }

      // Now try extracting after a short delay to allow script to initialize
      console.log("Content script injected, waiting for initialization");
      setTimeout(function () {
        extractWishlistData(tab.id);
      }, 1000);
    }
  );
}

/**
 * Extracts wishlist data from the page
 * @param {number} tabId - The ID of the current tab
 */
function extractWishlistData(tabId) {
  chrome.tabs.sendMessage(
    tabId,
    { action: "extractWishlistData" },
    function (response) {
      console.log("Received response from content script:", response);
      resetExtractButton();

      // Check for errors
      if (chrome.runtime.lastError) {
        console.error(
          "Error communicating with page:",
          chrome.runtime.lastError
        );
        showStatus(
          "Error communicating with the page: " +
            chrome.runtime.lastError.message,
          "error"
        );
        return;
      }

      if (!response) {
        showStatus(
          "No response from the page. Please refresh and try again.",
          "error"
        );
        return;
      }

      // Check for extraction errors
      if (!response.success) {
        const errorMsg = response.error || "Unknown error";
        showStatus("Failed to extract data: " + errorMsg, "error");
        return;
      }

      // Verify we have data
      if (
        !response.data ||
        !Array.isArray(response.data) ||
        response.data.length === 0
      ) {
        showStatus("No wishlist items found to extract.", "error");
        return;
      }

      console.log(
        `Successfully extracted ${response.data.length} wishlist items`
      );

      // Process the extracted data
      processExtractedData(response.data, response.wishlistName);
    }
  );
}

/**
 * Processes extracted wishlist data and saves it to Google Sheets
 * @param {Array} wishlistData - The extracted wishlist data
 * @param {string} wishlistName - The name of the wishlist
 */
function processExtractedData(wishlistData, wishlistName) {
  showStatus(
    `Saving ${wishlistData.length} listings to Google Sheets...`,
    "success"
  );

  // Send data to background script to handle Google Sheets API calls
  chrome.runtime.sendMessage(
    {
      action: "saveToGoogleSheets",
      wishlistData: wishlistData,
      wishlistName: wishlistName,
    },
    function (sheetsResponse) {
      if (chrome.runtime.lastError) {
        console.error(
          "Error saving to Google Sheets:",
          chrome.runtime.lastError
        );
        showStatus(
          "Error saving to Google Sheets: " + chrome.runtime.lastError.message,
          "error"
        );
        return;
      }

      console.log("Google Sheets response:", sheetsResponse);

      if (sheetsResponse && sheetsResponse.success) {
        handleSuccessfulSave(sheetsResponse);
      } else {
        handleFailedSave(sheetsResponse);
      }
    }
  );
}

/**
 * Handles successful save to Google Sheets
 * @param {Object} sheetsResponse - The response from the Google Sheets API
 */
function handleSuccessfulSave(sheetsResponse) {
  showStatus("Data successfully exported to Google Sheets!", "success");

  // Update UI to show spreadsheet link
  document.getElementById("spreadsheetUrl").style.display = "block";

  // Store the URL as a data attribute on the button
  const openSpreadsheetButton = document.getElementById("openSpreadsheet");
  openSpreadsheetButton.setAttribute("data-url", sheetsResponse.spreadsheetUrl);

  // Save spreadsheet info
  chrome.storage.local.set({
    spreadsheetId: sheetsResponse.spreadsheetId,
    spreadsheetUrl: sheetsResponse.spreadsheetUrl,
  });

  // Automatically open the spreadsheet in a new tab
  console.log("Opening spreadsheet in new tab:", sheetsResponse.spreadsheetUrl);
  if (sheetsResponse.spreadsheetUrl) {
    chrome.tabs.create({
      url: sheetsResponse.spreadsheetUrl,
    });
  } else {
    console.error("Spreadsheet URL is missing:", sheetsResponse);
  }
}

/**
 * Handles failed save to Google Sheets
 * @param {Object} sheetsResponse - The error response
 */
function handleFailedSave(sheetsResponse) {
  // Check if this is an authentication error
  if (sheetsResponse && sheetsResponse.needsAuth) {
    console.log("Authentication required, prompting user to sign in");
    // Hide extraction controls and show login instead
    document.getElementById("extractionControls").style.display = "none";
    document.getElementById("loginStatus").style.display = "block";
    showStatus("Please sign in with Google to continue", "error");
  } else {
    // Handle other errors
    const errorMsg =
      sheetsResponse && sheetsResponse.error
        ? sheetsResponse.error
        : "Unknown error";
    showStatus("Failed to export data to Google Sheets: " + errorMsg, "error");
  }
}

/**
 * Resets the extract button to its original state
 */
function resetExtractButton() {
  const extractButton = document.getElementById("extract");
  extractButton.disabled = false;
  extractButton.textContent = "Extract Wishlist Data";
}

/**
 * Displays a status message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('success' or 'error')
 */
function showStatus(message, type) {
  console.log("Status:", message, type);
  const statusElement = document.getElementById("status");
  statusElement.textContent = message;
  statusElement.className = "status " + type;
  statusElement.style.display = "block";

  // Auto-hide success messages after 5 seconds
  if (type === "success") {
    setTimeout(function () {
      statusElement.style.display = "none";
    }, 5000);
  }
}
