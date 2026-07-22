# Photo Size Converter

Photo Size Converter is a browser-based image compression tool for reducing a photo to a user-defined file size. It runs entirely in the browser, so JPG, PNG, and WebP files can be resized and converted without uploading them to a server.

Website: https://yeshan-jun.github.io/photo-size-converter/

## What It Does

- Opens local photos directly in the browser.
- Accepts a target file size in kilobytes.
- Compresses the photo to stay at or below the selected target.
- Preserves the largest useful dimensions before reducing resolution.
- Searches for the highest JPEG quality that fits the target size.
- Applies mobile photo orientation information in supported browsers.
- Places transparent PNG areas on a white background.
- Compares the original photo with the converted result.
- Shows file size, dimensions, format, quality, and size reduction.
- Downloads the converted image as a JPG file.

## Supported Image Formats

The converter accepts:

- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- WebP (`.webp`)

The maximum input file size is 50 MB.

All converted files are downloaded in JPEG format. Transparent areas in PNG and WebP images are filled with white because JPEG does not support transparency.

## How To Use

### Select A Photo

Open the website in a modern browser, then add a photo in one of two ways:

- Drag the photo onto the upload area.
- Click the upload area and choose a file from the file picker.

After a file is selected, the tool shows its file name, file size, dimensions, and a thumbnail preview.

Use **Change** to choose a different photo before conversion.

### Set The Target File Size

Enter the maximum output size in the **Target file size** field.

The default target is:

```text
10 KB
```

Accepted target values range from:

```text
1 KB to 50,000 KB
```

The result is created at or below the selected target. The converter tries to stay as close as practical to that limit while preserving useful image quality.

Examples:

- Enter `10` for a photo no larger than 10 KB.
- Enter `25` for a photo no larger than 25 KB.
- Enter `100` for a photo no larger than 100 KB.

### Convert The Photo

Click **Convert to XX KB** after selecting a valid photo and target size.

During conversion, the tool:

1. Reads the image locally in the browser.
2. Applies stored photo orientation when the browser supports it.
3. Converts the image to JPEG.
4. Searches for the highest JPEG quality that fits the target.
5. Reduces image dimensions only when quality adjustment is not enough.
6. Repeats the quality search using the selected dimensions.

Large photos are resized to a browser-friendly working size before compression to reduce memory usage.

If the selected target is too small for the photo, the tool displays a friendly message and asks for a larger target.

### Review The Result

After conversion, the result panel compares the original and converted photos.

The original photo section shows:

- File size
- Pixel dimensions
- Source format

The converted photo section shows:

- Final file size
- Final pixel dimensions
- JPEG quality
- Percentage reduction

The result remains in the browser until another photo is selected, the page is refreshed, or **Start over** is used.

### Download The Converted Photo

Click **Download JPG** to save the converted image.

The downloaded file name is generated from the original file name and target size.

Example:

```text
passport-photo-10kb.jpg
```

Use **Start over** to clear the current photo and begin another conversion.

## Compression Behavior

The converter prioritizes image quality and dimensions in this order:

1. Keep the original dimensions when the image already fits the target.
2. Search for the highest JPEG quality that stays below the target.
3. Estimate a smaller image scale when quality reduction alone is insufficient.
4. Search for the largest dimensions that can fit the target.
5. Search again for the highest quality at those dimensions.

The output is designed to remain below the target size rather than exceed an upload limit. Browser JPEG encoders can produce slightly different results across browsers and operating systems.

## Mobile Photo Orientation

Photos taken on phones may store rotation information separately from the image pixels.

When supported, the converter asks the browser to apply the image orientation stored by iPhone and Android cameras before compression. A browser fallback is used when that decoding method is unavailable.

The converted JPG is rendered in the corrected orientation.

## Static Deployment

This website is a static application. It does not require a backend, database, account system, or external image-processing API.

The static site root contains:

```text
index.html
style.css
script.js
compression-utils.js
```

### GitHub Pages

The repository is designed to be published at:

```text
https://yeshan-jun.github.io/photo-size-converter/
```

To deploy it:

1. Create the repository `yeshan-jun/photo-size-converter`.
2. Upload the project files to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**.
5. Choose the `main` branch and `/ (root)`.
6. Save the Pages settings.

The included `.nojekyll` file tells GitHub Pages to serve the project as a plain static website.

### Python

For a local preview, run this command inside the project directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

Use a local web server instead of opening `index.html` directly because the project loads JavaScript as an ES module.

### Nginx

The project can also be served from an Nginx static site directory:

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/photo-size-converter;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Other Static Hosts

The same project files can be hosted by any static hosting service, including Apache HTTP Server, Caddy, Netlify, Vercel static hosting, Cloudflare Pages, or an object storage bucket configured for static website hosting.

## Tests

### Utility Tests

The utility tests cover target-size validation, adaptive scaling, file-size formatting, and generated download names.

Run:

```bash
npm test
```

### Browser Smoke Test

The browser test checks:

- Required HTML elements
- CSS and ES module loading
- File selection
- Convert button activation
- 10 KB and 25 KB conversion
- Invalid target validation
- Result download availability
- Mobile photo orientation

Run it when Python Playwright and Chromium are available:

```bash
python tests/browser_smoke.py
```

## Project Structure

```text
.
├── index.html
├── style.css
├── script.js
├── compression-utils.js
├── package.json
├── tests/
│   ├── compression-utils.test.js
│   ├── browser_smoke.py
│   └── fixtures/
├── .nojekyll
├── .gitignore
├── LICENSE
└── README.md
```

## Privacy

Photo Size Converter processes selected photos locally in the browser.

The application does not require an account and does not send the selected image to a backend for compression. Closing or refreshing the page clears the current in-memory conversion state.

## Repository

https://github.com/yeshan-jun/photo-size-converter

## License

This project is released under the MIT License.
