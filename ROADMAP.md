# Moodinfinite roadmap

This is a quality roadmap for the boards and tools the app already has. It does not add a board type. The order is what to do first, what to do next, and what to leave for later.

Compared products, from their public pages in October 2026:

- **Milanote** (infinite moodboard): [milanote.com/product/moodboarding](https://milanote.com/product/moodboarding) and the [moodboard guide](https://milanote.com/guide/create-better-moodboards). Drag in images, notes, video, and files. A built-in photo library, starter templates, and a web clipper. Boards are free-form rather than a fixed grid.
- **PromptHero** (AI prompts): [prompthero.com](https://prompthero.com/). A public gallery you search by model (Midjourney, Flux, Stable Diffusion, Sora, and others). Each hit is the prompt text beside the image or video it produced.
- **Boords** (storyboards): [storyboard views](https://boords.com/docs/storyboard-views), [concepts](https://boords.com/docs/concepts), and [animatics](https://boords.com/docs/animatics). Frames carry an image plus dialogue, action, and timing. Edit, grid, and script views. Draw on a frame. Play the frames as a timed animatic.
- **Coolors** (palettes): [generate a palette](https://coolors-help.zendesk.com/hc/en-us/articles/360010581980-Generate-a-palette). Spacebar generates, a lock keeps a column, columns can be reordered or added, and a click copies the hex with a visible copied confirmation. Colors can also be pulled from a photo.
- **Todoist** (lists and tasks): [task view](https://www.todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C). A task has a description, date, priority, subtasks, comments, and a file. Search covers project, label, and date. Google Keep is the closer card-and-checklist cousin, which Moodlist already follows.

Moodgantt is the timeline cousin of that task list. Asana-style dependency lines were not opened as a separate page for this pass. The gaps below come from the running board.

## Boards this roadmap covers

| Board in the tab bar | What it is today |
| --- | --- |
| Moodinfinite | Infinite canvas. Tools: select, image, video, text, comment, link, text list, draw, arrow, box, circle, measure, counter, grid, eyedropper, connectors. |
| Moodprompt | Prompt cards with a platform, image or video, two reference slots, tags, and variables. |
| Moodtone | Color Seeker palettes: shades, tones, and harmonies, lock, and copy. |
| Moodflow | Horizontal story frames with a picture, title, action, duration, camera, status, and a minimap. |
| Moodgantt | Groups, dated task bars, progress, status, assignees, and a today line. |
| Moodlist | Color checklist cards, pin, search, images, and drag-to-reorder. |

## What is missing

**Moodinfinite canvas.** Milanote starts you from a template or a photo library and lets a caption live on the image. This canvas can already hold images, text, comments, links, drawings, shapes, and connectors, and it saves locally. A new board is a blank grid with no hint, and the zoom level is invisible. Connectors now stay beside the shapes they join. They still do not offer a minimap, a frame, or a template. The eyedropper, measure tool, and grid exist. Snap to grid is a setting, not something you can see while you drag.

**Moodprompt.** PromptHero is a public search across models, with the picture next to the words. Moodprompt is a private working set: platform, media type, references, tags, copy, and variables. A new prompt tab is an empty scroll area. There is no version of a prompt, and no side-by-side of the text and a generated result beyond the two reference slots.

**Moodtone.** Coolors and Moodtone both generate with the spacebar and lock a color. Coolors also reorders columns, changes how many colors there are, extracts a palette from a photo, and shows a copied state on the color. Moodtone already shows hex, RGB, HSL, and CMYK on hover, and a toast on copy. The swatch itself did not say that the copy happened.

**Moodflow.** Boords adds drawing on the frame, a script view, and an animatic that plays each frame for its duration. Moodflow already has the frame, the notes, the duration slider, camera choices, status, reorder, paste, and a minimap. A new story has zero frames and no invitation to add the first one. There is no playback.

**Moodgantt.** The timeline can hold groups, tasks, dates, progress, status, workers, and zoom. A new plan is an empty sidebar. Tasks do not depend on each other, so a slip does not push the next bar.

**Moodlist.** Todoist adds due dates, priorities, subtasks, and reminders. Moodlist already has the Keep-style card, color, pin, search, images, and a real empty state ("No cards yet"). Items are one level deep.

## Now

These six are the finish line for this pass. Each one is in the running app.

1. **Canvas zoom readout** (Moodinfinite canvas, view). A control in the corner shows the zoom percent. Clicking it returns to 100% and keeps the same point in the center of the view.
2. **Canvas empty guidance** (Moodinfinite canvas). With no items, the board says it is empty and names Text (`T`), Image (`I`), Box (`B`), and middle-click pan. The note leaves when the first item exists, and it does not block the canvas.
3. **Prompt empty state** (Moodprompt). An empty prompt board says "No prompts yet" and **Add a prompt** creates the first card. A provider or tag filter that hits nothing says "No prompts match".
4. **Story empty state** (Moodflow). A story with no frames says "No frames yet" and **Add a frame** creates the first frame.
5. **Plan empty state** (Moodgantt). A plan with no groups says "No groups yet" and **Add a group** creates the first group.
6. **Swatch copy confirmation** (Moodtone). Clicking a palette swatch marks that swatch with the word Copied.

## Next

Do these after the now-tier. They stay inside the current boards and tools.

1. **Canvas minimap** (Moodinfinite canvas, view). Moodflow already has one. The canvas should show where you are when the board is larger than the window.
2. **Snap state while dragging** (Moodinfinite canvas, select). The snap-to-grid setting should be visible on the board, including the Shift override, so a move does not feel like it jumped.
3. **Image caption** (Moodinfinite canvas, image). Select an image and type a caption on it, the way a Milanote image takes a label without a separate text box.
4. **Prompt copy stays on the card** (Moodprompt). The copy button should show that the text was copied, the same way a Moodtone swatch now does.
5. **Animatic playback** (Moodflow). Play the frames in order, each for its duration, so pacing can be checked without leaving the board.
6. **Palette length and order** (Moodtone). Add, remove, and drag swatches. Coolors treats that as basic; Moodtone is fixed at the generated set.
7. **Due date on a card item** (Moodlist). One date field on a checklist row, surfaced by the search that already exists.
8. **Task dependency** (Moodgantt). A line from one bar to the next, so moving a task shows what it pushes.

## Later

Larger work. Still no new board type.

1. **Starter templates** (Moodinfinite canvas). A few empty layouts for a moodboard, a flowchart of connectors, and a grid of images.
2. **Photo search on the image tool** (Moodinfinite canvas, image). Search a stock library without leaving the board.
3. **Web clipper for the link tool** (Moodinfinite canvas, link). Save an image or URL from another tab onto the canvas.
4. **Draw on a story frame** (Moodflow, and the canvas draw tool's behavior). Sketch on the frame instead of only uploading a picture.
5. **Script view** (Moodflow). Edit every frame's action and dialogue in one column, then return to the horizontal board.
6. **Colors from an image** (Moodtone, eyedropper). Build a palette from a canvas image, not only from a base hex.
7. **Send a palette to the canvas** (Moodtone and Moodinfinite canvas). Drop the five swatches onto the board as boxes.
8. **Subtasks** (Moodlist). Indent a row under the one above it.
9. **Prompt versions** (Moodprompt). Keep the previous text of a card when it changes, and put it back in one step.
10. **Shared boards.** Realtime editing is out of scope until the single-player finish above is in place. Local save and Drive sync stay the way work moves between machines.
