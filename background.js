/**
 * Airbnb Wishlist to Google Sheets Extension
 * Background Script (background.js)
 *
 * This script handles OAuth2 authentication with Google and manages Google Sheets API requests.
 * It runs in the background and communicates with popup.js and content.js.
 */

// Track authentication state
let authToken = null;

/**
 * Validates the stored authentication token with Google
 * @returns {Promise<string>} A promise that resolves with the valid token or rejects with an error
 */
function validateToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["token"], function (data) {
      // Handle chrome.storage errors
      if (chrome.runtime.lastError) {
        console.error("Storage error:", chrome.runtime.lastError);
        reject(new Error(`Storage error: ${chrome.runtime.lastError.message}`));
        return;
      }

      if (!data.token) {
        console.log("No token found in storage");
        reject(new Error("No authentication token found"));
        return;
      }

      // Verify the token is still valid with Google
      chrome.identity.getAuthToken({ interactive: false }, function (token) {
        // Handle identity API errors
        if (chrome.runtime.lastError) {
          console.log("Token validation error:", chrome.runtime.lastError);

          // Remove the invalid token and attempt refresh
          attemptTokenRefresh(data.token, resolve, reject);
        } else if (!token) {
          console.log("Token missing in response");
          attemptTokenRefresh(data.token, resolve, reject);
        } else {
          console.log("Token is valid");
          resolve(token);
        }
      });
    });
  });
}

/**
 * Attempts to refresh an invalid token
 * @param {string} oldToken - The token to be refreshed
 * @param {function} resolve - Promise resolution function
 * @param {function} reject - Promise rejection function
 */
function attemptTokenRefresh(oldToken, resolve, reject) {
  console.log("Attempting to refresh invalid token");

  // Remove the invalid token
  chrome.identity.removeCachedAuthToken({ token: oldToken }, function () {
    // Try to get a new token non-interactively first
    chrome.identity.getAuthToken({ interactive: false }, function (newToken) {
      if (chrome.runtime.lastError || !newToken) {
        console.log(
          "Non-interactive token refresh failed:",
          chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : "No token returned"
        );
        reject(new Error("Authentication token expired"));
      } else {
        console.log("Token refreshed successfully");
        // Update the stored token
        chrome.storage.local.set({ token: newToken }, function () {
          if (chrome.runtime.lastError) {
            console.error(
              "Error saving refreshed token:",
              chrome.runtime.lastError
            );
            // Still return the token even if storage fails
          }
          resolve(newToken);
        });
      }
    });
  });
}

// Add event listeners for startup and installation
chrome.runtime.onStartup.addListener(function () {
  console.log("Extension starting up, validating token");
  validateToken()
    .then((token) => console.log("Token validated on startup"))
    .catch((error) =>
      console.log("Token validation failed on startup:", error.message)
    );
});

chrome.runtime.onInstalled.addListener(function () {
  console.log("Extension installed/updated, validating token");
  validateToken()
    .then((token) => console.log("Token validated on install"))
    .catch((error) =>
      console.log("Token validation failed on install:", error.message)
    );
});

// Main message listener
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("Background script received message:", request.action);

  // Handle authorization requests
  if (request.action === "authorize") {
    handleAuthorization(sendResponse);
    return true; // Indicates async response
  }

  // Handle saving data to Google Sheets
  if (request.action === "saveToGoogleSheets") {
    handleSaveToGoogleSheets(request, sendResponse);
    return true; // Indicates async response
  }
});

/**
 * Handles authorization requests from the popup
 * @param {function} sendResponse - Function to send response back to caller
 */
function handleAuthorization(sendResponse) {
  console.log("Authorizing with Google...");
  authorize()
    .then((token) => {
      console.log("Authorization successful, token received");
      authToken = token;

      // Save token to storage
      chrome.storage.local.set({ token: token }, function () {
        if (chrome.runtime.lastError) {
          console.error(
            "Error saving token to storage:",
            chrome.runtime.lastError
          );
          sendResponse({
            success: false,
            error: `Error saving authentication: ${chrome.runtime.lastError.message}`,
          });
          return;
        }
        sendResponse({ success: true });
      });
    })
    .catch((error) => {
      console.error("Authorization error:", error);
      sendResponse({ success: false, error: error.message });
    });
}

/**
 * Handles requests to save data to Google Sheets
 * @param {Object} request - The request object containing wishlist data
 * @param {function} sendResponse - Function to send response back to caller
 */
function handleSaveToGoogleSheets(request, sendResponse) {
  console.log("Saving data to Google Sheets...");

  // Check for valid data
  if (!isValidWishlistData(request.wishlistData)) {
    console.error("No valid wishlist data received");
    sendResponse({
      success: false,
      error: "No valid wishlist data to save",
    });
    return;
  }

  // Get token from storage
  chrome.storage.local.get(["token"], function (data) {
    // Handle storage errors
    if (chrome.runtime.lastError) {
      console.error("Storage error:", chrome.runtime.lastError);
      sendResponse({
        success: false,
        error: `Storage error: ${chrome.runtime.lastError.message}`,
      });
      return;
    }

    // Check for missing token
    if (!data.token) {
      handleMissingToken(sendResponse);
      return;
    }

    // Validate token before proceeding
    validateToken()
      .then((validToken) => {
        console.log("Token validated, proceeding with spreadsheet operations");

        // Create new spreadsheet and save data
        saveToGoogleSheets(
          validToken,
          null, // Always create a new spreadsheet
          request.wishlistData,
          request.wishlistName
        )
          .then((result) => {
            console.log("Data saved to sheets successfully:", result);
            sendResponse({
              success: true,
              spreadsheetId: result.spreadsheetId,
              spreadsheetUrl: result.spreadsheetUrl,
            });
          })
          .catch((error) => {
            console.error("Google Sheets API error:", error);

            // Check if this is an auth error requiring re-authentication
            if (
              error.message &&
              (error.message.includes("401") ||
                error.message.includes("auth") ||
                error.message.includes("permission"))
            ) {
              // Clear token and request re-auth
              handleAuthError(sendResponse);
            } else {
              // Handle other API errors
              sendResponse({
                success: false,
                error: error.message || "Error saving to Google Sheets",
              });
            }
          });
      })
      .catch((error) => {
        // Token validation failed
        console.error("Token validation failed:", error);
        handleAuthError(sendResponse);
      });
  });
}

/**
 * Checks if wishlist data is valid
 * @param {Array} wishlistData - The wishlist data to validate
 * @returns {boolean} True if data is valid
 */
function isValidWishlistData(wishlistData) {
  return wishlistData && Array.isArray(wishlistData) && wishlistData.length > 0;
}

/**
 * Handles missing token scenario
 * @param {function} sendResponse - Function to send response back to caller
 */
function handleMissingToken(sendResponse) {
  console.error("Not authenticated with Google");
  // Clear any potentially corrupted auth data
  chrome.storage.local.clear(function () {
    if (chrome.runtime.lastError) {
      console.error("Error clearing storage:", chrome.runtime.lastError);
    } else {
      console.log("Storage cleared due to missing token");
    }

    // Inform the user they need to authenticate
    sendResponse({
      success: false,
      error: "Authentication required. Please sign in with Google.",
      needsAuth: true, // Flag to indicate auth is needed
    });
  });
}

/**
 * Handles authentication errors
 * @param {function} sendResponse - Function to send response back to caller
 */
function handleAuthError(sendResponse) {
  // Clear storage and request re-authentication
  chrome.storage.local.clear(function () {
    if (chrome.runtime.lastError) {
      console.error("Error clearing storage:", chrome.runtime.lastError);
    }

    sendResponse({
      success: false,
      error: "Authentication required. Please sign in with Google.",
      needsAuth: true,
    });
  });
}

/**
 * Initiates the OAuth2 authorization flow with Google
 * @returns {Promise<string>} A promise that resolves with the auth token
 */
function authorize() {
  return new Promise((resolve, reject) => {
    console.log("Requesting auth token...");
    chrome.identity.getAuthToken(
      {
        interactive: true,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      },
      function (token) {
        if (chrome.runtime.lastError) {
          console.error("Auth Error:", chrome.runtime.lastError);
          reject(
            new Error(
              chrome.runtime.lastError.message || "Authentication failed"
            )
          );
        } else if (!token) {
          console.error("Auth Error: No token returned");
          reject(new Error("No authentication token returned"));
        } else {
          console.log("Auth Success, token received");
          resolve(token);
        }
      }
    );
  });
}

/**
 * Handles API responses, checking for errors
 * @param {Response} response - The fetch API response
 * @returns {Promise<Object>} A promise that resolves with the JSON data
 */
function handleApiResponse(response) {
  if (!response.ok) {
    return response
      .json()
      .then((data) => {
        const errorMessage =
          data.error?.message ||
          response.statusText ||
          `HTTP Error ${response.status}`;
        throw new Error(errorMessage);
      })
      .catch((error) => {
        // If JSON parsing fails, throw the original HTTP error
        if (error instanceof SyntaxError) {
          throw new Error(
            `HTTP Error ${response.status}: ${response.statusText}`
          );
        }
        throw error;
      });
  }
  return response.json();
}

/**
 * Creates a new Google Spreadsheet
 * @param {string} token - The OAuth token
 * @param {string} wishlistName - The name of the wishlist
 * @returns {Promise<Object>} A promise that resolves with the created spreadsheet data
 */
function createSpreadsheet(token, wishlistName) {
  console.log("Creating new spreadsheet for wishlist:", wishlistName);

  const title =
    "Airbnb Wishlist: " +
    (wishlistName || "Untitled") +
    " - " +
    new Date().toLocaleDateString();

  return fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
      sheets: [
        {
          properties: {
            title: wishlistName || "Wishlist",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  })
    .then(handleApiResponse)
    .then((data) => {
      console.log("Spreadsheet created successfully:", data);
      return data;
    });
}

/**
 * Saves wishlist data to Google Sheets
 * @param {string} token - The OAuth token
 * @param {string|null} existingSpreadsheetId - ID of existing spreadsheet (if any)
 * @param {Array} wishlistData - The wishlist data to save
 * @param {string} wishlistName - The name of the wishlist
 * @returns {Promise<Object>} A promise with the spreadsheet info
 */
function saveToGoogleSheets(
  token,
  existingSpreadsheetId,
  wishlistData,
  wishlistName
) {
  console.log("Processing data for Sheets API:", wishlistData.length, "items");

  // Create header row
  const headers = [
    "Property Name",
    "Rating",
    "Date",
    "Beds",
    "Total Price",
    "Link to listing",
    "Comment",
  ];

  // Format data for Sheets API
  const values = [headers];

  // Add data rows
  wishlistData.forEach((item) => {
    values.push([
      item.propertyName || "",
      item.rating || "",
      item.date || "",
      item.beds || "",
      item.totalPrice || "",
      item.link || "",
      item.comment || "",
    ]);
  });

  // Always create a new spreadsheet
  console.log("Creating new spreadsheet...");
  return createSpreadsheet(token, wishlistName).then((spreadsheet) => {
    const spreadsheetId = spreadsheet.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    console.log("New spreadsheet created with ID:", spreadsheetId);

    // Now update the newly created spreadsheet with our data
    return updateSpreadsheet(token, spreadsheetId, values, wishlistName).then(
      () => ({
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: spreadsheetUrl,
      })
    );
  });
}

/**
 * Updates a spreadsheet with data
 * @param {string} token - The OAuth token
 * @param {string} spreadsheetId - The ID of the spreadsheet to update
 * @param {Array} values - The data values to write
 * @param {string} sheetName - The name of the sheet to update
 * @returns {Promise<Object>} A promise with the update result
 */
function updateSpreadsheet(token, spreadsheetId, values, sheetName) {
  console.log(
    "Updating spreadsheet:",
    spreadsheetId,
    "with",
    values.length,
    "rows"
  );

  // First check if the spreadsheet exists and get sheet information
  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    }
  )
    .then(handleApiResponse)
    .then((spreadsheetData) => {
      // Find the sheet with the specified name
      console.log("Retrieved spreadsheet data:", spreadsheetData);

      // Find the first sheet or the sheet with the specified name
      const sheet = spreadsheetData.sheets.find(
        (s) =>
          s.properties.title === sheetName ||
          (sheetName === undefined && s.properties.index === 0)
      );

      if (!sheet) {
        throw new Error(
          `Sheet ${sheetName || "Sheet1"} not found in the spreadsheet`
        );
      }

      // Use the sheet title for the API calls
      const sheetTitle = sheet.properties.title;
      console.log(`Found sheet: ${sheetTitle}`);

      // Clear existing data first
      return clearSpreadsheetData(token, spreadsheetId, sheetTitle).then(() => {
        // Then update with new data
        return updateSpreadsheetData(token, spreadsheetId, sheetTitle, values);
      });
    });
}

/**
 * Clears data from a spreadsheet
 * @param {string} token - The OAuth token
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} sheetTitle - The title of the sheet to clear
 * @returns {Promise<Object>} A promise with the clear result
 */
function clearSpreadsheetData(token, spreadsheetId, sheetTitle) {
  console.log(`Clearing data from sheet: ${sheetTitle}`);

  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:Z1000:clear`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    }
  )
    .then(handleApiResponse)
    .then((response) => {
      console.log("Spreadsheet cleared successfully");
      return response;
    });
}

/**
 * Updates spreadsheet with new data
 * @param {string} token - The OAuth token
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} sheetTitle - The title of the sheet to update
 * @param {Array} values - The data values to write
 * @returns {Promise<Object>} A promise with the update result
 */
function updateSpreadsheetData(token, spreadsheetId, sheetTitle, values) {
  console.log(
    `Updating sheet ${sheetTitle} with ${values.length} rows of data`
  );

  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:G${values.length}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  )
    .then(handleApiResponse)
    .then((response) => {
      console.log("Spreadsheet data updated successfully");
      return response;
    });
}
