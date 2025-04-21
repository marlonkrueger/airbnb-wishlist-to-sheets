/**
 * Airbnb Wishlist to Google Sheets Extension
 * Content Script (content.js)
 *
 * This script extracts data from Airbnb wishlist pages and sends it back to the extension.
 * It runs only on Airbnb wishlist URLs and is responsible for scraping listing details.
 */

console.log("Content script loaded on:", window.location.href);

// Main message listener for communication with popup/background
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("Message received in content script:", request);

  // Respond to ping requests to confirm content script is loaded
  if (request.action === "ping") {
    console.log("Ping received, responding");
    sendResponse({ success: true });
    return true;
  }

  // Handle extraction requests
  if (request.action === "extractWishlistData") {
    console.log("Starting extraction...");

    // Wrap extraction in try/catch to handle any unexpected errors
    try {
      // Extract wishlist name and proceed with extraction
      const wishlistName = extractWishlistName();

      // Wait for DOM to be ready before extracting data
      if (document.readyState === "loading") {
        console.log("Document still loading, waiting before extraction...");
        document.addEventListener("DOMContentLoaded", () => {
          extractAndSendListingData(wishlistName, sendResponse);
        });
      } else {
        // Document is already loaded, proceed with extraction
        extractAndSendListingData(wishlistName, sendResponse);
      }
    } catch (error) {
      console.error("Error in extraction process:", error);
      sendResponse({
        success: false,
        error: error.message || "Unknown error occurred during extraction",
      });
    }
    return true; // Indicates async response
  }
});

/**
 * Extracts the wishlist name from the page
 * @returns {string} The name of the wishlist
 */
function extractWishlistName() {
  try {
    const wishlistName =
      document.querySelector("h1")?.textContent.trim() || "Airbnb Wishlist";
    console.log("Wishlist name:", wishlistName);
    return wishlistName;
  } catch (error) {
    console.error("Error extracting wishlist name:", error);
    return "Airbnb Wishlist"; // Default fallback name
  }
}

/**
 * Main function to extract listing data and send response back
 * @param {string} wishlistName - The name of the wishlist
 * @param {function} sendResponse - Callback function to send response
 */
function extractAndSendListingData(wishlistName, sendResponse) {
  try {
    // Find all listings on the page
    const listingCards = findListingCards();

    if (listingCards.length === 0) {
      handleNoListingsFound(sendResponse);
      return;
    }

    console.log("Found", listingCards.length, "listing cards");

    // Process each listing card and extract data
    const wishlistData = listingCards.map((card, index) => {
      console.log(`Processing card ${index + 1}/${listingCards.length}`);
      return extractListingData(card, index);
    });

    console.log("Extracted data for all items:", wishlistData);

    // Send the extracted data back to the extension
    sendResponse({
      success: true,
      data: wishlistData,
      wishlistName: wishlistName,
    });
  } catch (error) {
    console.error("Error extracting wishlist data:", error);
    sendResponse({
      success: false,
      error: error.message || "Unknown error occurred during extraction",
    });
  }
}

/**
 * Finds all listing cards on the page using multiple selector strategies
 * @returns {Array} Array of DOM elements representing listing cards
 */
function findListingCards() {
  // Updated selectors that match the Airbnb HTML structure
  const selectors = [
    '[data-testid="card-container"]',
    '.cy5jw6o[role="group"]',
    ".wishlist-card",
    ".wishlistCard",
    'div[role="group"]',
  ];

  let listingCards = [];

  // Try each selector until we find elements
  for (const selector of selectors) {
    console.log(`Trying selector: ${selector}`);
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} elements with selector: ${selector}`);

    if (elements.length > 0) {
      listingCards = Array.from(elements);
      console.log(
        `Using selector ${selector} which found ${listingCards.length} cards`
      );
      break;
    }
  }

  return listingCards;
}

/**
 * Handles the case when no listings are found
 * @param {function} sendResponse - Callback function to send response
 */
function handleNoListingsFound(sendResponse) {
  console.warn("No listing cards found with any selector");

  // Log the entire relevant DOM area to help debugging
  const wishlistArea = document.querySelector("main");
  if (wishlistArea) {
    console.log(
      "Wishlist area HTML structure:",
      wishlistArea.innerHTML.substring(0, 500) + "..."
    );
  }

  sendResponse({
    success: false,
    error: "No listing cards found. Please refresh the page and try again.",
  });
}

/**
 * Extracts data from a single listing card
 * @param {Element} card - The DOM element for the listing card
 * @param {number} index - The index of the current card
 * @returns {Object} Extracted listing data
 */
function extractListingData(card, index) {
  // Debug first card to help with troubleshooting
  if (index === 0) {
    console.log("First card HTML:", card.outerHTML.substring(0, 500) + "...");
  }

  return {
    propertyName: extractPropertyName(card),
    rating: extractRating(card),
    date: extractDate(card),
    beds: extractBedInfo(card),
    totalPrice: extractPrice(card),
    link: extractLink(card),
    comment: extractComment(card),
  };
}

/**
 * Extracts the property name from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The property name
 */
function extractPropertyName(card) {
  try {
    // First try to get the title directly
    const titleElement = card.querySelector(
      '[data-testid="listing-card-subtitle"] span, .t6mzqp7'
    );
    if (titleElement) {
      const propertyName = titleElement.textContent.trim();
      console.log(`Found property name (from title): ${propertyName}`);
      return propertyName;
    }

    // If that fails, try other selectors
    const propertyNameElements = card.querySelectorAll(
      '[data-testid="listing-card-title"]'
    );
    if (propertyNameElements.length > 0) {
      const propertyName = propertyNameElements[0].textContent.trim();
      console.log(`Found property name (from data-testid): ${propertyName}`);
      return propertyName;
    }

    return ""; // Return empty string if not found
  } catch (error) {
    console.log("Error extracting property name:", error);
    return "";
  }
}

/**
 * Extracts the rating from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The rating
 */
function extractRating(card) {
  try {
    // From the HTML example, search for rating classes or elements
    const ratingContainer = card.querySelector(
      ".r4a59j5, [data-testid*='rating']"
    );
    if (ratingContainer) {
      // Extract the text which should include the number
      const ratingText = ratingContainer.textContent.trim();
      const match = ratingText.match(/(\d+[.,]\d+)/);
      if (match) {
        const rating = match[1];
        console.log(`Found rating: ${rating}`);
        return rating;
      }
    }
    return "";
  } catch (error) {
    console.log("Error extracting rating:", error);
    return "";
  }
}

/**
 * Extracts the date information from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The date information
 */
function extractDate(card) {
  try {
    // Target the specific button element with the date information
    const dateButton = document.querySelector("button.c12tvzjc");

    if (dateButton) {
      const date = dateButton.textContent.trim();
      console.log(`Found date from date button: ${date}`);
      return date;
    }
    return "";
  } catch (error) {
    console.log("Error extracting date:", error);
    return "";
  }
}

/**
 * Extracts bed information from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The bed information
 */
function extractBedInfo(card) {
  try {
    if (card) {
      // First, try to find the g1qv1ctd container class which often holds listing details
      const detailsContainer = card.querySelector(".g1qv1ctd");

      if (detailsContainer) {
        // The bed info might be in the third child div
        const divChildren = detailsContainer.querySelectorAll(
          ":scope > div:not([aria-hidden='true'])"
        );

        if (divChildren.length >= 3) {
          const potentialBedDiv = divChildren[2]; // Third child (index 2)
          const fullText = potentialBedDiv.textContent.trim();

          // Check if the text appears to be duplicated
          if (fullText.length % 2 === 0) {
            const halfLength = fullText.length / 2;
            const firstHalf = fullText.substring(0, halfLength).trim();
            const secondHalf = fullText.substring(halfLength).trim();

            // If the two halves are identical or very similar, just use the first half
            if (
              firstHalf === secondHalf ||
              areStringSimilar(firstHalf, secondHalf)
            ) {
              console.log(
                `Detected duplicate text, using first half: ${firstHalf}`
              );
              return firstHalf;
            } else {
              // If not duplicated, use the full text
              console.log(`Using full text for beds: ${fullText}`);
              return fullText;
            }
          } else {
            // If not even length, just use the full text
            console.log(`Using full text for beds: ${fullText}`);
            return fullText;
          }
        }
      }
    }
    return "";
  } catch (error) {
    console.log("Error extracting beds:", error);
    return "";
  }
}

/**
 * Checks if two strings are similar (handles minor differences)
 * @param {string} str1 - First string to compare
 * @param {string} str2 - Second string to compare
 * @returns {boolean} True if strings are similar
 */
function areStringSimilar(str1, str2) {
  // Simple check for very similar strings
  if (str1.includes(str2) || str2.includes(str1)) {
    return true;
  }

  // If length difference is significant, they're not similar
  if (Math.abs(str1.length - str2.length) > 3) {
    return false;
  }

  // Count matching characters
  let matches = 0;
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) {
      matches++;
    }
  }

  // If 80% or more characters match, consider them similar
  return matches / Math.max(str1.length, str2.length) >= 0.8;
}

/**
 * Extracts price information from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The price information
 */
function extractPrice(card) {
  try {
    // Look for the element with the total price class or containing total price text
    const totalPriceElement = card.querySelector(
      "._tt122m, [class*='price'], [class*='total']"
    );

    if (totalPriceElement) {
      let totalPrice = totalPriceElement.textContent.trim();
      // Remove the "Gesamtpreis: " or similar prefix if it exists
      totalPrice = totalPrice.replace(/^Gesamtpreis:\s*/, "");
      totalPrice = totalPrice.replace(/^Insgesamt\s*/, "");
      console.log(`Found total price: ${totalPrice}`);
      return totalPrice;
    } else {
      // Try to find price by looking for currency symbols
      const allElements = card.querySelectorAll("div, span");
      for (const el of allElements) {
        if (
          el.textContent &&
          (el.textContent.includes("€") || el.textContent.includes("$"))
        ) {
          const totalPrice = el.textContent.trim();
          console.log(`Found price with currency symbol: ${totalPrice}`);
          return totalPrice;
        }
      }
    }
    return "";
  } catch (error) {
    console.log("Error extracting price:", error);
    return "";
  }
}

/**
 * Extracts link to the listing from a listing card
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The link to the listing
 */
function extractLink(card) {
  try {
    // The link is usually in an <a> element
    const linkElement = card.querySelector('a[href*="/rooms/"]');
    if (linkElement) {
      const href = linkElement.getAttribute("href");
      if (href) {
        // Extract just the room part to avoid long URLs with tracking params
        const roomMatch = href.match(/\/rooms\/(\d+)/);
        if (roomMatch) {
          const link = "https://www.airbnb.com/rooms/" + roomMatch[1];
          console.log(`Found link: ${link}`);
          return link;
        } else {
          const link = "https://www.airbnb.com" + href.split("?")[0];
          console.log(`Found partial link: ${link}`);
          return link;
        }
      }
    }
    return "";
  } catch (error) {
    console.log("Error extracting link:", error);
    return "";
  }
}

/**
 * Extracts comment from a listing card if any exists
 * @param {Element} card - The DOM element for the listing card
 * @returns {string} The comment for the listing
 */
function extractComment(card) {
  try {
    // Get the room ID from the link - this is the reliable identifier
    let roomId = "";
    const linkElement = card.querySelector('a[href*="/rooms/"]');
    if (linkElement) {
      const href = linkElement.getAttribute("href");
      const roomMatch = href.match(/\/rooms\/(\d+)/);
      if (roomMatch) {
        roomId = roomMatch[1];
        console.log(`Room ID: ${roomId}`);
      }
    }

    // Look for a comment div in a cpj3fk1 container that directly follows this card
    const nextElement = card.nextElementSibling;
    if (nextElement && nextElement.classList.contains("cpj3fk1")) {
      const commentDiv = nextElement.querySelector("div.nzkbe2g");
      if (commentDiv) {
        const commentText = commentDiv.textContent
          .replace(/Bearbeiten/i, "")
          .trim();
        console.log(`Found comment: ${commentText}`);
        return commentText;
      }
    }

    // If no comment found directly after the card, the listing probably has no comment
    console.log("No comment found for this listing");
    return "";
  } catch (error) {
    console.log("Error extracting comment:", error);
    return "";
  }
}

// Add a listener to notify when the content script has fully loaded
console.log("Content script fully loaded and ready");
