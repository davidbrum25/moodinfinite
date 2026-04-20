# Moodinfinite v0.9.7

<div align="center">
  <img src="https://github.com/davidbrum25/moodinfinite/blob/main/_branding/_png/moodinfinite__Logotipo_alpha.png?raw=true" alt="Moodinfinite Logo" width="400"/>
</div>

<p align="center">
  <strong>A versatile, infinite digital canvas for your ideas. Create moodboards, brainstorm, organize thoughts, and craft the perfect AI prompts.</strong>
</p>

---

## Demo

Try it live: https://davidbrum25.github.io/moodinfinite/index.html

---

## Screenshots

![Screenshot of Moodinfinite in action](https://github.com/davidbrum25/moodinfinite/blob/main/_screenshots/preview_1.jpg)
![Screenshot of Moodinfinite in action](https://github.com/davidbrum25/moodinfinite/blob/main/_screenshots/preview_2.jpg)

---

## Core Features

### Canvas & Tools

* **Infinite Canvas:** Pan and zoom freely on a boundless digital canvas.
* **Core Tools & Hotkeys:**
    * **Select (A):** The default tool for selecting and moving items.
    * **Add Image (I):** Add images from your computer, by pasting, or by drag-and-drop.
    * **Add Text (T):** Create rich Post-it notes with Markdown, custom fonts, and colors.
    * **Add Comment (N):** Sticky-note style annotations with optional icons.
    * **Add Link (K):** Place interactive hyperlinks with favicon previews on the canvas.
    * **Add Text List (L):** Interactive checklists with togglable checkbox items.
    * **Draw (D):** Freehand drawing and sketching.
    * **Add Arrow (Shift+A):** Draw directional arrows. Hold Shift to snap to 45° angles.
    * **Add Box (B) & Circle (C):** Geometric shapes with Fill or Stroke toggle.
    * **Measure (M):** Draw a measurement line in px, cm, or inches.
    * **Add Grid (Alt+G):** Create structured grids with adjustable rows and columns.
    * **Eyedropper (E):** Pick any color directly from the canvas.

* **Clipboard:** `Ctrl+C` (Copy), `Ctrl+X` (Cut), `Ctrl+V` (Paste), `Ctrl+D` (Duplicate).
* **History:** `Ctrl+Z` (Undo), `Ctrl+Shift+Z` (Redo).
* **Selection:** `Ctrl+A` (Select All), `Ctrl+I` (Invert Selection).
* **Export:** `Shift+S` (PNG export) or `Shift+C` (Copy to Clipboard).

### View Navigation

* **Center View (Home):** Instantly reset the camera to the canvas origin at 1:1 zoom.
* **Focus on Selection (.):** Automatically zoom and pan to perfectly frame all selected items. If nothing is selected, fits the entire board into view.
* **Zoom:** Mouse wheel or pinch gesture.
* **Pan:** Middle-click drag, Space + left-click drag, or two-finger drag on touch.

### Item Manipulation

* **Layering:** `Home` / `End` (front/back), `Page Up` / `Page Down` (step up/down).
* **Grouping:** `Ctrl+G` to group, `Ctrl+Shift+G` to ungroup.
* **Group Ordered (`Ctrl+Shift+O`):** Automatically groups and numbers selected images from top-left to bottom-right.
* **Transform:** `S` for Scale, `R` for Rotate. Hold `Shift` to maintain aspect ratio or snap rotation.
* **Flip:** `H` (Horizontal), `V` (Vertical).
* **Pin (P):** Lock an item to prevent accidental movement.
* **Auto Align (`Ctrl+Shift+A`):** Neatly arrange multiple selected items into a grid.
* **Delete:** `Del` or `Backspace`.

### Node Connectors

* Hover over any element to reveal **4 edge connection ports**. Drag from a port to another element to draw a dynamic bezier curve connector.
* **Reroute Nodes:** Double-click a connector line to add a reroute node and reshape the path.
* **Smart Deletion:** Hold `Ctrl` / `Cmd` while hovering over a wire or reroute node — your cursor changes to a red scissor icon. Click to cut the connection.

### Moodprompt Tabs

**Moodprompt** is a dedicated tab type for AI artists. Instead of a canvas, it gives you a structured environment to build, test, and organize generation prompts.

Each Moodprompt file consists of **Prompt Cards**, which feature:

* **Numbered and Reorderable:** Drag and drop cards to organize your workflow.
* **Platform Selector:** Choose the target AI platform (e.g., Midjourney, OpenAI Sora, Kling).
* **Media Type Toggle:** Switch between `Image` and `Video` prompt types.
* **Reference Image Slots:** Upload one or two reference images.
* **Dedicated Text Area:** Monospace text area for writing and refining complex prompts.

### Persistence & Storage

* **LocalForage Auto-Saving:** Your entire workspace (projects, tabs, images, history) is silently saved in the browser's database and restored automatically on reload.
* **Compressed `.mood` Exports:** Save projects as `.mood` files — ZIP archives containing the raw state and images compressed as `.webp` binaries for minimal file sizes.

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge).

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/davidbrum25/moodinfinite.git
   ```
2. Navigate to the project directory:
   ```
   cd moodinfinite
   ```
3. Open `index.html` in your web browser.

No build tools or servers required — it's a fully static web app!

---

## Credits

Made by H. David Brum
* **Email:** [davidbrum@gmail.com](mailto:davidbrum@gmail.com)
* **Links:** [linktr.ee/davidbrum](https://linktr.ee/davidbrum)

## Support the Project

If you find this tool useful and want to help me build more, consider supporting me on Patreon. Your contributions keep the vibes flowing!  
[Support on Patreon](https://www.patreon.com/cw/bdvd)

---

## Update Log

### ✨ v0.9.7 — Camera Navigation & Bug Fixes

*   **📍 Center View (Home):** A new toolbar button and hotkey to instantly reset the camera to the canvas origin at 1:1 zoom.
*   **🔍 Focus on Selection (.):** Press `.` to automatically zoom and pan the camera to perfectly frame all selected items. If nothing is selected, the entire board is framed.
*   **🎨 List Element Color Fix:** The color picker now correctly applies color changes to Text List elements (the change was silently ignored before).

---

### ✨ v0.9.6 — Storage Overhaul & Scaling Fixes

This update brings a massive overhaul to the storage architecture, focusing on reliability, performance, and seamless offline data persistence.

*   **🧠 LocalForage Auto-Saving:** The app now silently and automatically saves your entire workspace (projects, tabs, images, and history) natively in your browser's database. Your boards will instantly load exactly where you left them across page reloads.
*   **🗜️ Compressed .mood Exports:** Replaced legacy JSON exports with a robust `.mood` export pipeline. Hitting save securely generates a ZIP archive containing your raw project state and your images dynamically compressed as `.webp` binaries, vastly reducing file payload sizes.
*   **🖼️ Refined Text Elements Scaling:** Text elements now actively word-wrap instead of scaling the source font, and automatically lock their minimum dimensions to effectively contain the exact dimensions of the typed text constraints during resize actions.
*   **🎨 Layering & Grouping Fixes:** Corrected the rendering loop order so that connections and arrows correctly adhere to natural layer ordering. Fixed an invisible element bug where 'Comment', 'Link', and 'Text List' elements would vanish when grouped together.

---

### ✨ v0.9.5 — Next-Gen Post-it Notes & Premium UI

*   **📝 Next-Gen Post-it Note:**
    *   **Full Markdown Engine:** The Text element now supports headings (`#`, `##`, `###`), bullets (`-`, `*`), **bold**, *italic*, and monospaced `` `inline code` ``.
    *   **Auto-Responsive Containers:** Notes now intelligently resize their boundaries to perfectly wrap your text.
    *   **Smart Color Adaptive UI:** Background colors can be changed instantly via the selection toolbar. Text color flips automatically for readability.
*   **⌨️ Power-User Hotkeys:** `Ctrl+B` (bold), `Ctrl+I` (italic), `Ctrl+Enter` (save note), `Escape` (discard).
*   **💎 Premium Glassmorphism UI:** Redesigned confirmation modals with glassmorphism, backdrop blur, and a safety confirmation step when closing board tabs.
*   **🎨 Default Font (Nunito):** Set as the default for all text-capable elements.

---

### ✨ v0.9.4 — Mobile UX & Bug Fixes

*   **📱 Reliable Connectors:** Rebuilt tap-to-connect using native `pointerdown` events, eliminating duplicate triggers on mobile/tablet.
*   **🎨 Live Color Previews:** Hovering over Color Palette options now instantly previews the style.
*   **🐛 Group Transformation Preservation:** Fixed an issue where items scaled inside a parent group would snap back to unscaled dimensions when ungrouped.
*   **🛡️ Event Crash Prevention:** Fixed an `Undefined preventDefault` crash on iOS/Android during connector wire tracing.

---

### ✨ v0.9.3 — Node Connectors & Checklists

*   **🔌 Node Connectors:** Drag from any element's edge port to another to draw dynamic bezier curve connectors.
*   **↩️ Reroute Nodes:** Double-click a connector to split it and add a reroute node.
*   **✂️ Smart Deletion:** Hold `Ctrl`/`Cmd` over a wire to reveal the scissor cursor and cut connections with a click.
*   **✅ Checklist Element:** Add interactive checklist elements with togglable checkboxes, color, and font editing.

---

### ✨ v0.9.2 — Link Element & Icon Modernization

*   **🔗 New "Link" Element:** Interactive hyperlinks with automatic favicon fetching.
*   **🎭 Icon Modernization:** Replaced individual icon assets with the unified **Iconify** system.
*   **💬 Notes Tool Refinements:** Better layout, icon support, and a cleaner selection toolbar.
*   **🛡️ Bug Fixes:** Fixed a critical crash during element duplication.

---

### ✨ v0.9.1 — Linux Middle-Click Fix

*   **🐧 Linux Middle-Click Fix:** Prevented the middle mouse button from triggering paste on Linux.

---

### ✨ v0.9.0 — Performance & Group Ordered

*   **🚀 Performance Optimization:** Global image cache to reduce memory usage and prevent crashes with many images.
*   **🛡️ Stability Improvements:** Fixed undo/redo history crashes with large images.
*   **🔢 Group Ordered (`Ctrl+Shift+O`):** Automatically group and number selected images from top-left to bottom-right.

---

### ✨ v0.8.9 — Tab System Polish & Scaling

*   **Visual Tab Connection:** Eliminated the visual gap between the tab bar and the canvas.
*   **Mobile Tab Deletion:** Added a delete button in the mobile tabs popup.
*   **Intuitive Scaling:** Inverted scaling behavior — aspect ratio locked by default, `Shift` for free-form.
*   **Enhanced Reset Button:** Fully resets position, rotation, and flip state of selected elements.
*   **Codebase Refactoring:** Separated into modular `index.html`, `style.css`, and `script.js` files.

---

### ✨ v0.8.7 — Measure Tool & Help

*   **📏 New "Measure" Tool:** Measure distances in pixels, cm, or inches.
*   **👆 Enhanced Touch Controls:** Improved pinch-to-zoom and two-finger pan.
*   **❓ In-App Help:** Comprehensive help modal with all features and hotkeys.
*   **📋 Copy to Clipboard:** Copy the entire board as a PNG image.
*   **🎨 Color Palettes:** Curated palettes panel for quick theming.

---

### ✨ v0.8.6 — Theming & New Tools

*   **🎨 Enhanced Theming:** Per-project color palettes.
*   **✒️ Google Fonts Integration:** Multiple new fonts added.
*   **🖱️ Scrollable Tabs:** Work with many projects seamlessly.
*   **⚪ New "Circle" Tool:** Draw circles on the canvas.

---

### ✨ v0.8.0 — Multi-Project Workspace

*   **🚀 All-New Tab System:** Work on multiple boards simultaneously.
*   **✍️ Moodprompt Tabs:** Structured AI prompt management for Midjourney, Sora, and more.
*   **💾 Persistent User Settings:** Colors, grid, and preferences saved in local storage.
*   **📱 Mobile Long-Press Menu:** Context menu accessible on touch via long press.

---

*Built with ❤️ for creators. Questions? Open an issue!*