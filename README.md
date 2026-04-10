# Moodinfinite v0.9.4

<div align="center">
  <img src="https://github.com/davidbrum25/moodinfinite/blob/main/_branding/_png/moodinfinite__Logotipo_alpha.png?raw=true" alt="Moodinfinite Logo" width="400"/>
</div>

<p align="center">
  <strong>A versatile, infinite digital canvas for your ideas. Create moodboards, brainstorm, organize thoughts, and now, craft the perfect AI prompts.</strong>
</p>

---

## ✨ What's New in Version 0.9.4

This update focuses on polishing the mobile user experience and squashing several functional bugs.

*   **📱 Mobile Quality of Life Improvements:**
    *   **Reliable Connectors:** The "Connect" (tap-to-connect) button logic has been entirely rebuilt to use native `pointerdown` events. This completely eliminates duplicate tap triggers and ghost-firing on mobile and tablet devices, guaranteeing flawless connections.
    *   **Smart Interactions:** The app reliably handles "tap-outside" captures across all floating panels (Context Menu, Icon Picker, and Palette Panel) before they interfere with desktop or mobile canvases.
    *   **Live Color Previews:** Hovering your mouse over any Color Palette option will now instantly preview the style across the entire app UI without permanently altering your workflow.
*   **🐛 Bug Fixes & Stability:**
    *   **Group Transformation Preservation:** Fixed an issue where items that were scaled inside a parent group would "snap back" to their unscaled dimensions when ungrouped. The coordinate matrix translation now flawlessly applies the exact scale properties to all primitive elements and drawn paths during ungrouping.
    *   **Event Crash Prevention:** Sanitized synthetic pointer events internally to halt an `Undefined preventDefault` crash that would abruptly cancel the underlying touch framework when finishing a wire trace between elements on iOS/Android.

---

## ✨ What's New in Version 0.9.3

This update introduces powerful node-based visual connections and functional Checklists!

*   **🔌 Node Connectors:** You can now visually link elements together!
    *   **Drag and Drop Wires:** Hover over any selectable element to reveal 4 edge connection ports. Drag from one port to another to draw dynamic, auto-updating bezier curves between elements.
    *   **Reroute Nodes:** Double-click anywhere on a connector line to split it and spawn a circular reroute node for clean visual organization.
    *   **Smart Deletion:** Hold `Ctrl` or `Cmd` while hovering over wires or reroute nodes. Your cursor will turn into a distinctive red scissor, allowing you to instantly cut connections with a click.
*   **✅ Checklist Element:** Add robust list elements natively to your boards. Based loosely on classic checklist notes, each row has a checkbox that lets you toggle items as done or pending.
    *   **Color & Font Editing:** Easily change checklist background colors or typography via the localized element toolbar without confusing extra options.

---

## ✨ What's New in Version 0.9.2

This major update introduces the **Link** element, modernizes the icon system, and refines the **Notes** tool for a more premium experience.

*   **🔗 New "Link" Element:** Place interactive hyperlinks on the canvas!
    *   **Favicon Integration:** Automatically fetches the website's favicon for a branded look.
    *   **Quick Go Button:** A dedicated hover-sensitive button to launch links instantly in a new tab.
    *   **Smart Truncation:** Titles automatically truncate to fit the container without overlapping actions.
*   **🎭 Icon Modernization:** Replaced individual icon assets with a unified **Iconify** system, ensuring pixel-perfect icons across all tools and menus.
*   **💬 Notes Tool Refinements:**
    *   **Improved Layout:** Better vertical centering and padding for a cleaner "one-liner" look.
    *   **Icon Support:** Icons now integrate seamlessly with text without breaking the layout.
    *   **Selection Toolbar:** Cleaned up the notes-specific toolbar to focus on essential creative actions.
*   **🛡️ Stability & Bug Fixes:** Fixed a critical crash during element duplication and optimized the hover detection engine.

---

## ✨ What's New in Version 0.9.1

This update addresses a specific usability issue on Linux systems.

*   **🐧 Linux Middle-Click Fix:** Prevented the middle mouse button from triggering the "paste" action on Linux, ensuring it only performs the intended panning operation.

---

## ✨ What's New in Version 0.9.0

This update brings critical performance optimizations and stability improvements for heavy workflows.

*   **🚀 Performance Optimization:** Implemented a global image cache to significantly reduce memory usage and prevent crashes when working with multiple high-resolution images.
*   **🛡️ Stability Improvements:** Fixed a critical issue where large images in the undo/redo history could cause the application to crash.
*   **💾 Project Format Update:** Updated the project save format to include the image cache, ensuring faster loads and smaller file sizes for projects with many duplicate images.
*   **🔢 Group Ordered:** A new feature to automatically group and number selected images from top-left to bottom-right. Perfect for creating ordered sequences or storyboards. (Shortcut: `Ctrl+Shift+O`)

---

## ✨ What's New in Version 0.8.9

This update brings several bug fixes and usability improvements.

*   **Visual Tab Connection:** Eliminated the visual gap between the top bar tabs and the canvas, ensuring a seamless connection.
*   **Mobile Tab Deletion:** Added a delete button to each board in the mobile tabs popup, allowing for easy removal of open tabs on mobile devices.
*   **Intuitive Scaling:** Inverted the scaling behavior: now, scaling maintains the aspect ratio by default, and holding `Shift` enables free-form scaling.
*   **Enhanced Reset Button:** The reset button for selected elements now fully resets position (to the center of the view), rotation, and flip state. (Note: Resetting to original size is not yet supported as original dimensions are not stored.)
*   **Codebase Refactoring:** The application structure has been modernized by separating the single `index.html` file into modular `index.html`, `style.css`, and `script.js` files, improving maintainability and organization.

---

## ✨ What's New in Version 0.8.7

This update focuses on adding more tools to the app and improving the overall user experience.

* **📏 New "Measure" Tool:** A new tool to measure distances on the canvas in pixels, cm, or inches.
* **👆 Enhanced Touch Controls:** Pinch to zoom and two-finger pan have been improved for a smoother experience on touch devices.
* **❓ In-App Help:** A comprehensive help modal has been added, explaining all the features and hotkeys.
* **📋 Copy to Clipboard:** You can now copy the entire board to the clipboard as a PNG image.
* **🎨 Color Palettes:** A new panel with a curated selection of color palettes to quickly theme your projects.

---

## ✨ What's New in Version 0.8.6

This update brings several new features and improvements to enhance your creative workflow.

* **🎨 Enhanced Theming:** Enjoy a more robust color management system that allows for per-project color palettes.
* **✒️ Google Fonts Integration:** Added a variety of new fonts from Google Fonts to bring your ideas to life.
* **🖱️ Improved Tab Management:** Tabs are now scrollable, allowing you to work with a large number of projects seamlessly.
* **⚪ New "Circle" Tool:** A new tool to draw circles on the canvas.
* ** Improved Paste Functionality:** Prevents pasting the same content multiple times.
* **⭐ GitHub Link:** Added a link to the project's GitHub repository for easy access to the source code and documentation.

---

## ✨ What's New in Version 0.8.0

This is a massive update that transforms Moodinfinite into a multi-project workspace!

* **🚀 All-New Tab System:** Say goodbye to working on a single board at a time. Moodinfinite now features a dynamic tab bar, allowing you to open multiple projects simultaneously.
* **✍️ Introducing 'Moodprompt' Tabs:** A brand new tab type designed specifically for AI artists and creators. Organize, manage, and perfect your prompts for platforms like Midjourney, Sora, and more.
* **💾 Persistent User Settings:** Your preferences for colors, grid visibility, and other settings are now automatically saved in your browser's local storage.
* **📱 Mobile Long-Press Menu:** The context menu (right-click menu) is now accessible on touch devices via a long press.

---

### The New Tab System

Work on multiple moodboards and prompt files in one seamless interface. The new tab bar at the top of the application allows you to:

* **Create New Tabs:** Click the icons to add a new `Moodinfinite Board` or a new `Moodprompt File`.
* **Switch Between Projects:** Simply click on a tab to switch to that project.
* **Manage Tabs:**
    * **Rename:** Double-click or right-click a tab to rename it.
    * **Close:** Click the `x` icon to close a tab.
    * **Reorder:** Drag and drop tabs to arrange them in any order you like.


### Introducing: Moodprompt Tabs

**Moodprompt** is a powerful new tool for anyone working with generative AI. Instead of a canvas, this tab type gives you a structured environment to build, test, and organize your prompts.

Each Moodprompt file consists of "Prompt Cards," which feature:

* **Numbered and Reorderable:** Drag and drop cards to organize your workflow.
* **Platform Selector:** Choose the target AI platform (e.g., Midjourney, OpenAI Sora, Kling) to keep your prompts organized.
* **Media Type Toggle:** Switch between `Image` and `Video` prompt types. The video option provides a second image slot for video-to-video prompts.
* **Reference Image Slots:** Upload one or two reference images to associate with your prompt.
* **Dedicated Text Area:** A large text area with a monospace font, perfect for writing and refining complex prompts.

---

## Core Features

### Canvas & Tools

* **Infinite Canvas:** Pan and zoom freely on a boundless digital canvas.
* **Core Tools & Hotkeys:**
    * **Select (A):** The default tool for selecting and moving items.
    * **Add Image (I):** Add images from your computer, by pasting, or by drag-and-drop.
    * **Add Text (T):** Create rich text boxes with custom fonts and alignment.
    * **Add Arrow (Shift+A):** Draw arrows to connect ideas.
    * **Add Box (B):** Create solid or outlined rectangles.
    * **Add Circle (C):** Create solid or outlined circles.
    * **Add Grid (Alt+G):** Create structured grids.
    * **Draw (D):** A freehand drawing tool.
    * **Eyedropper (E):** Pick colors directly from the canvas.

* **Clipboard:** `Ctrl+C` (Copy), `Ctrl+X` (Cut), `Ctrl+V` (Paste), `Ctrl+D` (Duplicate).
* **History:** `Ctrl+Z` (Undo), `Ctrl+Shift+Z` (Redo).
* **Export:** `Shift+S` to export the current board as a PNG.

---

## Credits

Made by H. David Brum
* **Email:** [davidbrum@gmail.com](mailto:davidbrum@gmail.com)
* **Links:** [linktr.ee/davidbrum](https://linktr.ee/davidbrum)

# OLD VERSION, pre tab system.

# Mood Infinite

A simple, no-fuss web application for creating moodboards and basic storyboards. Built with the help of Gemini 2.5 for quick vibe-coding.

Created by me for me and my team but release to everybody.

## Overview

Mood Infinite lets you rapidly assemble visual ideas without the overhead of complex tools. It's designed for creators who want to jump straight into sketching concepts for projects like design, film, or storytelling.

### Key Features
- **Quick Moodboard Creation**: Drag-and-drop images, notes, and colors to build inspiring boards.
- **Storyboard Sketching**: Simple canvas for rough sketches and sequence planning.
- **Minimalist Interface**: No accounts, no installs—just open and create.
- **Export Options**: Save your boards as images or PDFs for sharing.

## Why Mood Infinite?

Existing tools often demand too much setup and hassle. I built this for my own workflow: something lightweight to start a project and move on quickly. Now, it's ready for anyone to create quick moodboards, storyboards, or sketches to kick off visual projects.

## Getting Started

## Demo
Try it live: https://davidbrum25.github.io/moodinfinite/index.html.


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

No build tools or servers required—it's a fully static web app!

### Usage
1. Open the app in your browser.
2. Drag images from your computer or use the built-in search for stock assets.
3. Add text notes, shapes, or freehand sketches to your canvas.
4. Arrange elements into a board or sequence.
5. Export your creation and iterate!

![Screenshot of Mood Infinite in action](https://github.com/davidbrum25/moodinfinite/blob/main/_screenshots/preview_1.jpg)
![Screenshot of Mood Infinite in action](https://github.com/davidbrum25/moodinfinite/blob/main/_screenshots/preview_2.jpg)

## Known issues:
1. Still need to make a working version for tablets and phones!.


## Support the Project
If you find this tool useful and want to help me build more, consider supporting me on Patreon. Your contributions keep the vibes flowing!  
[Support on Patreon](https://www.patreon.com/cw/bdvd)

---

*Built with ❤️ for creators. Questions? Open an issue!*