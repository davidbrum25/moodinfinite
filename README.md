# Moodinfinite v1.2.0

![Moodinfinite Logo](https://github.com/davidbrum25/moodinfinite/blob/main/_branding/_png/moodinfinite__Logotipo_alpha.png?raw=true)

**A versatile, infinite digital canvas for your ideas. Create moodboards, brainstorm, organize thoughts, and craft the perfect AI prompts.**

---

## Demo

Try it live: <https://davidbrum25.github.io/moodinfinite/index.html>

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
* **Zoom:** Mouse wheel or pinch gesture. The corner shows the zoom percent. Click it to return to 100% and keep the same point in the center of the view.
* **Minimap:** When the board is larger than the window, the corner map shows the items and a frame for the current view. Panning moves that frame.
* **Pan:** Middle-click drag, Space + left-click drag, or two-finger drag on touch.

### Item Manipulation

* **Layering:** `Home` / `End` (front/back), `Page Up` / `Page Down` (step up/down).
* **Grouping:** `Ctrl+G` to group, `Ctrl+Shift+G` to ungroup.
* **Group Ordered (`Ctrl+Shift+O`):** Automatically groups and numbers selected images from top-left to bottom-right.
* **Transform:** `S` for Scale, `R` for Rotate. Hold `Shift` to maintain aspect ratio or snap rotation.
* **Flip:** `H` (Horizontal), `V` (Vertical).
* **Pin (P):** Lock an item to prevent accidental movement.
* **Snap:** While a selection moves, the board says whether snap is on. Hold `Shift` to flip the saved snap setting for that drag.
* **Image caption:** Select an image and type in Caption. The words sit on the image, stay after a reload, and undo returns the previous caption.
* **Empty board:** With nothing on the canvas, the board names Text (`T`), Image (`I`), Box (`B`), and middle-click pan, and offers Moodboard, Flowchart, and Image grid starters.
* **Auto Align (`Ctrl+Shift+A`):** Neatly arrange multiple selected items into a grid.
* **Delete:** `Del` or `Backspace`.

### Node Connectors

* Hover over any element to reveal **4 edge connection ports**. Drag from a port to another element to draw a connector. The route leaves the port you chose, stays beside the two shapes, and does not shoot off the board when those shapes move.
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
* **Copy confirmation:** The copy control on the card says Copied.
* **Previous text:** Leaving a changed prompt keeps the wording it had before. Previous puts that text back in one step.

### Moodflow Tabs

**Moodflow** is a sequential storytelling tool. It organizes your project into a linear timeline of frames, perfect for storyboarding, video planning, or mapping user journeys.

* **Horizontal Sequencing:** Frames are laid out in a side-by-side gallery for narrative flow.
* **Visual Beats:** Each frame features a large image slot (upload or paste support).
* **Production Notes:** Dedicated fields for Title, Action/Dialogue, Duration, and Camera notes.
* **Drag & Drop:** Easily reorder your story beats to refine the narrative.
* **Play:** Walks the frames in order and holds each one for its duration.
* **Draw:** Draw a stroke directly on a frame.
* **Script:** Lists every frame's action and dialogue in one column. Edits show on the frames after you return to the board.

### Moodtone Tabs

**Moodtone** builds a color palette from a base color.

* **Generate and lock:** Spacebar rebuilds the harmony. Lock a swatch to keep it. Click a swatch and it says Copied.
* **Length and order:** Add swatch grows the row, Remove drops one while at least two remain, and dragging a swatch reorders the row.
* **From a canvas image:** Build the palette from a picture on a Moodinfinite board.
* **Send to canvas:** Drop the current swatches onto the board as filled boxes.

### Moodgantt Tabs

**Moodgantt** is a timeline for groups and tasks.

* **Plan:** Groups, tasks, dates, progress, status, workers, and zoom. An empty plan asks for the first group.
* **Dependencies:** A task can depend on another. Dragging that task, or dragging its start edge, pushes the dependent bar by the same number of days, and a line joins them.

### Moodlist Tabs

**Moodlist** is a structured, Google Keep–style checklist environment. It's perfect for managing tasks, tracking assets, or organizing ideas into color-coded cards.

* **Checklist Cards:** Create reorderable checklists with rich-text titles and distinct color backgrounds.
* **Visual Attachments:** Attach images directly to your cards for visual reference or inspiration.
* **Smart Pinning:** Pin important lists to the top of your board for instant access.
* **Rapid Entry:** Use `Enter` to quickly add multiple items in a row without losing focus.
* **Live Filter:** Instantly search through your cards by title, item content, or a row's due date via the top search bar.
* **Due dates:** Each checklist row can carry a date.
* **Subtasks:** Indent tucks a row one level under the row above it. The first row stays flush. Outdent brings it back.
* **Drag-to-Reorder:** Use the dedicated grip handles to intuitively rearrange items within a list.

### Persistence & Storage

* **LocalForage Auto-Saving:** Your entire workspace (projects, tabs, images, history) is silently saved in the browser's database and restored automatically on reload.
* **Compressed `.mood` Exports:** Save projects as `.mood` files — ZIP archives containing the raw state and images compressed as `.webp` binaries for minimal file sizes.

---

## Getting Started

### Prerequisites

* A modern web browser (Chrome, Firefox, Safari, or Edge).

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/davidbrum25/moodinfinite.git
   ```

2. Navigate to the project directory:

   ```bash
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

### ✨ v1.2.0 — Faster boards and a tighter toolset

* **⚡ Faster canvas drawing:** A steady board skips repeated layout work, so large canvases stay responsive.
* **💾 Safer autosave:** Saves no longer store live link icons or video frames, so a reload keeps the project.
* **🖱️ Middle-click pan, live drags, and color pickers:** Pan with the middle button, see a selection or a connector while you drag (including in Firefox), and open the color picker again.
* **🔌 Connectors stay beside the shapes:** A route leaves the port you chose and stays near the two shapes when they move.
* **🗺️ Minimap and zoom chip:** The corner map shows where the view sits. The zoom percent is in the corner, and clicking it returns to 100%.
* **🧲 Snap while you drag:** The board says whether snap is on. Hold Shift to flip it for that move.
* **🏷️ Image captions:** Select an image and type a caption. It is saved with the board, and undo puts the previous caption back.
* **🧩 Empty-board templates:** An empty canvas can start as a Moodboard, a Flowchart, or an Image grid.
* **📋 Prompt copy and previous text:** The copy control on a Moodprompt card says Copied. Previous puts the last wording back in one step.
* **🎬 Moodflow play, draw, and script:** Play holds each frame for its duration. Draw stores a stroke on the frame. Script edits every frame from one column.
* **🎨 Moodtone palettes:** Add, remove, and reorder swatches. Build a palette from a canvas image, or send those swatches onto the canvas as boxes.
* **📅 Moodgantt dependencies:** Dragging a task, or its start edge, pushes the task that depends on it by the same number of days.
* **✅ Moodlist due dates and subtasks:** Search can find a row by its date. Indent tucks a row under the one above it.

---

### ✨ v1.1.0 — Moodlist & Rapid Organization

* **📋 Moodlist Tab Type:** A brand new project type inspired by Google Keep. Organize your thoughts into checklists with images and color coding.
* **📍 Smart Pinning:** Pin cards to the top of your Moodlist for easy prioritization.
* **🖼️ Image Attachments:** Upload images to individual cards to keep your visual references alongside your tasks.
* **🎨 Color-Coded Boards:** Choose from 11 curated dark-mode color themes for each list card.
* **⚡ Rapid Item Entry:** Optimized "Add Item" flow that keeps focus in the field for high-speed list creation.
* **⠿ Drag-to-Reorder:** Integrated HTML5 drag-and-drop system for reordering list items with dedicated grip handles.
* **🔍 Live Card Filtering:** Real-time search across all list cards in your project.

---

### ✨ v1.0.0 — Google Drive Cloud Sync & Persistence

* **☁️ Google Drive Integration:** Sign in with your Google account to save and load projects directly from your personal Drive. All files are stored in a dedicated `Moodinfinite` folder.
* **🔄 Seamless Cross-Device Sync:** Keep your projects in sync across all your devices. The app now handles conflict resolution and ensures your data is always safe.
* **💾 Persistent Sessions:** Stay logged in across page reloads. The app uses a secure silent refresh flow to keep your cloud connection active.
* **📊 Drive Storage Management:** Monitor your storage usage with a real-time meter in the account menu.
* **📂 Enhanced Cloud Picker:** Open projects from Drive with a premium file picker featuring live sorting (Date, Size, Name) and built-in file deletion.
* **🗑️ Remote File Management:** Delete unwanted projects from your Google Drive directly within the app interface.

---

### ✨ v0.9.9 — UI Polish & Moodflow Minimap

* **🎨 True Glassmorphism UI:** The topbar menu has been redesigned into a floating, fully transparent glass panel, allowing your canvas to blur beautifully underneath it.
* **🖱️ Moodflow Minimap:** Added a dedicated horizontal scroll minimap timeline for Moodflow tabs. It includes live visual previews of your frames, a draggable camera viewport, and a skip-to-start button for rapid navigation.
* **↔️ Horizontal Mousewheel Panning:** Scrolling your mouse wheel vertically inside a Moodflow tab now intuitively translates to smooth horizontal panning across your frames.
* **🎯 Drag-and-Drop Indicators:** When reordering Moodflow cards, the drop zone now dynamically illuminates with your accent color and a subtle scale animation to clearly indicate where the card will be inserted.
* **🏷️ Creation Tab Refinements:** Reorganized and renamed the creation buttons (Moodinfinite, Moodpront, Moodtone, Moodflow). They now display their signature brand colors seamlessly upon hover.
* **🎛️ Moodflow Controls:** The frame duration input is now an interactive slider (0s to 60s). The camera property is now a structured dropdown menu with predefined framing options.

---

### ✨ v0.9.8 — StoryFlow & Sequential Storytelling

* **🎬 StoryFlow Tabs:** A brand new project type for sequential planning.
* **🎞️ Horizontal Storyboarding:** Layout your ideas in a linear flow with dedicated fields for timing, camera, and dialogue.
* **📋 Paste-to-Frame:** Directly paste images from your clipboard into story frames for rapid ideation.
* **🔄 Reorderable Beats:** Drag and drop frames to instantly restructure your narrative.

---

### ✨ v0.9.7 — Camera Navigation & Bug Fixes

* **📍 Center View (Home):** A new toolbar button and hotkey to instantly reset the camera to the canvas origin at 1:1 zoom.
* **🔍 Focus on Selection (.):** Press `.` to automatically zoom and pan the camera to perfectly frame all selected items. If nothing is selected, the entire board is framed.
* **🎨 List Element Color Fix:** The color picker now correctly applies color changes to Text List elements (the change was silently ignored before).

---

### ✨ v0.9.6 — Storage Overhaul & Scaling Fixes

This update brings a massive overhaul to the storage architecture, focusing on reliability, performance, and seamless offline data persistence.

* **🧠 LocalForage Auto-Saving:** The app now silently and automatically saves your entire workspace (projects, tabs, images, and history) natively in your browser's database. Your boards will instantly load exactly where you left them across page reloads.
* **🗜️ Compressed .mood Exports:** Replaced legacy JSON exports with a robust `.mood` export pipeline. Hitting save securely generates a ZIP archive containing your raw project state and your images dynamically compressed as `.webp` binaries, vastly reducing file payload sizes.
* **🖼️ Refined Text Elements Scaling:** Text elements now actively word-wrap instead of scaling the source font, and automatically lock their minimum dimensions to effectively contain the exact dimensions of the typed text constraints during resize actions.
* **🎨 Layering & Grouping Fixes:** Corrected the rendering loop order so that connections and arrows correctly adhere to natural layer ordering. Fixed an invisible element bug where 'Comment', 'Link', and 'Text List' elements would vanish when grouped together.

---

### ✨ v0.9.5 — Next-Gen Post-it Notes & Premium UI

* **📝 Next-Gen Post-it Note:**
  * **Full Markdown Engine:** The Text element now supports headings (`#`, `##`, `###`), bullets (`-`, `*`), **bold**, *italic*, and monospaced `` `inline code` ``.
  * **Auto-Responsive Containers:** Notes now intelligently resize their boundaries to perfectly wrap your text.
  * **Smart Color Adaptive UI:** Background colors can be changed instantly via the selection toolbar. Text color flips automatically for readability.
* **⌨️ Power-User Hotkeys:** `Ctrl+B` (bold), `Ctrl+I` (italic), `Ctrl+Enter` (save note), `Escape` (discard).
* **💎 Premium Glassmorphism UI:** Redesigned confirmation modals with glassmorphism, backdrop blur, and a safety confirmation step when closing board tabs.
* **🎨 Default Font (Nunito):** Set as the default for all text-capable elements.

---

### ✨ v0.9.4 — Mobile UX & Bug Fixes

* **📱 Reliable Connectors:** Rebuilt tap-to-connect using native `pointerdown` events, eliminating duplicate triggers on mobile/tablet.
* **🎨 Live Color Previews:** Hovering over Color Palette options now instantly previews the style.
* **🐛 Group Transformation Preservation:** Fixed an issue where items scaled inside a parent group would snap back to unscaled dimensions when ungrouped.
* **🛡️ Event Crash Prevention:** Fixed an `Undefined preventDefault` crash on iOS/Android during connector wire tracing.

---

### ✨ v0.9.3 — Node Connectors & Checklists

* **🔌 Node Connectors:** Drag from any element's edge port to another to draw dynamic bezier curve connectors.
* **↩️ Reroute Nodes:** Double-click a connector to split it and add a reroute node.
* **✂️ Smart Deletion:** Hold `Ctrl`/`Cmd` over a wire to reveal the scissor cursor and cut connections with a click.
* **✅ Checklist Element:** Add interactive checklist elements with togglable checkboxes, color, and font editing.

---

### ✨ v0.9.2 — Link Element & Icon Modernization

* **🔗 New "Link" Element:** Interactive hyperlinks with automatic favicon fetching.
* **🎭 Icon Modernization:** Replaced individual icon assets with the unified **Iconify** system.
* **💬 Notes Tool Refinements:** Better layout, icon support, and a cleaner selection toolbar.
* **🛡️ Bug Fixes:** Fixed a critical crash during element duplication.

---

### ✨ v0.9.1 — Linux Middle-Click Fix

* **🐧 Linux Middle-Click Fix:** Prevented the middle mouse button from triggering paste on Linux.

---

### ✨ v0.9.0 — Performance & Group Ordered

* **🚀 Performance Optimization:** Global image cache to reduce memory usage and prevent crashes with many images.
* **🛡️ Stability Improvements:** Fixed undo/redo history crashes with large images.
* **🔢 Group Ordered (`Ctrl+Shift+O`):** Automatically group and number selected images from top-left to bottom-right.

---

### ✨ v0.8.9 — Tab System Polish & Scaling

* **Visual Tab Connection:** Eliminated the visual gap between the tab bar and the canvas.
* **Mobile Tab Deletion:** Added a delete button in the mobile tabs popup.
* **Intuitive Scaling:** Inverted scaling behavior — aspect ratio locked by default, `Shift` for free-form.
* **Enhanced Reset Button:** Fully resets position, rotation, and flip state of selected elements.
* **Codebase Refactoring:** Separated into modular `index.html`, `style.css`, and `script.js` files.

---

### ✨ v0.8.7 — Measure Tool & Help

* **📏 New "Measure" Tool:** Measure distances in pixels, cm, or inches.
* **👆 Enhanced Touch Controls:** Improved pinch-to-zoom and two-finger pan.
* **❓ In-App Help:** Comprehensive help modal with all features and hotkeys.
* **📋 Copy to Clipboard:** Copy the entire board as a PNG image.
* **🎨 Color Palettes:** Curated palettes panel for quick theming.

---

### ✨ v0.8.6 — Theming & New Tools

* **🎨 Enhanced Theming:** Per-project color palettes.
* **✒️ Google Fonts Integration:** Multiple new fonts added.
* **🖱️ Scrollable Tabs:** Work with many projects seamlessly.
* **⚪ New "Circle" Tool:** Draw circles on the canvas.

---

### ✨ v0.8.0 — Multi-Project Workspace

* **🚀 All-New Tab System:** Work on multiple boards simultaneously.
* **✍️ Moodprompt Tabs:** Structured AI prompt management for Midjourney, Sora, and more.
* **💾 Persistent User Settings:** Colors, grid, and preferences saved in local storage.
* **📱 Mobile Long-Press Menu:** Context menu accessible on touch via long press.

---

*Built with ❤️ for creators. Questions? Open an issue!*
