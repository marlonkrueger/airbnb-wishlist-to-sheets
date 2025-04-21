# Airbnb Wishlist to Google Sheets

A Chrome extension that extracts your Airbnb wishlist data and exports it to Google Sheets for easier comparison and decision-making.

## Features

- Extract property details from Airbnb wishlists with one click
- Automatically create a new Google Sheet with your wishlist data
- Export property name, rating, dates, beds, price, link, and comments
- Open the created spreadsheet directly from the extension

## Installation

### Local Development Installation

1. Clone this repository:

   ```
   git clone https://github.com/yourusername/airbnb-wishlist-to-sheets.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top-right corner

4. Click "Load unpacked" and select the extension directory

5. Set up your Google API credentials (see below)

## Google API Setup

Before using this extension, you'll need to create your own Google Cloud Project and OAuth credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)

2. Create a new project

3. Enable the Google Sheets API:

   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it

4. Create OAuth credentials:

   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Chrome Extension" as the application type
   - For "Application ID", enter your extension's ID (you can find this in Chrome's extension page)

5. Once created, copy your Client ID

6. Edit the `manifest.json` file and replace `YOUR_CLIENT_ID_HERE` with your actual Client ID:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID_HERE",
     "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
   }
   ```

## Usage

1. Navigate to any Airbnb wishlist page (e.g., https://www.airbnb.com/wishlists/XXXXX)

2. Click on the extension icon in your Chrome toolbar

3. Sign in with your Google account (first-time use)

4. Click "Extract Wishlist Data"

5. The extension will create a new Google Sheet with your wishlist data and open it in a new tab

## Development

### Project Structure

```
airbnb-wishlist-to-sheets/
├── manifest.json      # Extension configuration
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── background.js      # Background service worker for API operations
└── content.js         # Content script for extracting data from Airbnb
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
