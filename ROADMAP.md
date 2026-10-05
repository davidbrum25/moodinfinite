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

**Moodinfinite canvas.** Milanote starts you from a template or a photo library. This canvas holds images, text, comments, links, drawings, shapes, and connectors, and it saves locally. An empty board names the first tools. The corner shows zoom and a minimap of where the view sits. A selected image takes a caption. While you drag, the board says whether snap is on, including the Shift override. Connectors stay beside the shapes they join. Still missing: a frame tool and a built-in photo library. An empty board can start from a moodboard, a flowchart, or an image grid.

**Moodprompt.** PromptHero is a public search across models, with the picture next to the words. Moodprompt is a private working set: platform, media type, references, tags, variables, and a copy control that says Copied. An empty tab explains how to add the first card. There is no version of a prompt, and no side-by-side of the text and a generated result beyond the two reference slots.

**Moodtone.** Coolors and Moodtone both generate with the spacebar and lock a color. A swatch says Copied when you click it. Add swatch grows the row, Remove drops one, and dragging a swatch reorders the row. From canvas image builds the row from a picture on a Moodinfinite board. Send to canvas drops those swatches onto the board as boxes. Space still rebuilds a harmony from the base color.

**Moodflow.** Moodflow has the frame, the notes, the duration slider, camera choices, status, reorder, paste, a minimap, an empty-story prompt, Play, drawing on the frame, and a script column. Script edits every frame's action and dialogue, then Board returns to the horizontal frames.

**Moodgantt.** The timeline can hold groups, tasks, dates, progress, status, workers, and zoom. An empty plan asks for the first group. A task can depend on another. Dragging the first task pushes the dependent bar by the same number of days, and a line joins them.

**Moodlist.** Todoist adds priorities, subtasks, and reminders. Moodlist has the Keep-style card, color, pin, search, images, an empty state ("No cards yet"), and a due date on each row. Search matches that date. Items are one level deep.

## Now

These six are the finish line for this pass. Each one is in the running app.

1. **Canvas zoom readout** (Moodinfinite canvas, view). A control in the corner shows the zoom percent. Clicking it returns to 100% and keeps the same point in the center of the view.
2. **Canvas empty guidance** (Moodinfinite canvas). With no items, the board says it is empty and names Text (`T`), Image (`I`), Box (`B`), and middle-click pan. The note leaves when the first item exists, and it does not block the canvas.
3. **Prompt empty state** (Moodprompt). An empty prompt board says "No prompts yet" and **Add a prompt** creates the first card. A provider or tag filter that hits nothing says "No prompts match".
4. **Story empty state** (Moodflow). A story with no frames says "No frames yet" and **Add a frame** creates the first frame.
5. **Plan empty state** (Moodgantt). A plan with no groups says "No groups yet" and **Add a group** creates the first group.
6. **Swatch copy confirmation** (Moodtone). Clicking a palette swatch marks that swatch with the word Copied.
7. **Canvas minimap** (Moodinfinite canvas, view). When the board is larger than the window, the corner map shows the items and a frame for the current view. Panning moves that frame.
8. **Snap state while dragging** (Moodinfinite canvas, select). While a selection moves, the board says Snap on or Snap off. Holding Shift flips the saved snap setting and the label says so.
9. **Image caption** (Moodinfinite canvas, image). Select an image and type in Caption. The words sit on the image.
10. **Prompt copy stays on the card** (Moodprompt). The copy control on the card shows Copied.
11. **Animatic playback** (Moodflow). Play walks the frames in order and holds each one for its duration. Stop ends it.
12. **Palette length and order** (Moodtone). Add swatch appends a color, Remove takes one away while at least two remain, and dropping a swatch on another reorders the row. Space still rebuilds the harmony.
13. **Due date on a card item** (Moodlist). Each checklist row has a date. The existing search matches that date.
14. **Task dependency** (Moodgantt). A task can depend on another. Dragging the predecessor pushes the dependent task by the same number of days, and a line joins the two bars.
15. **Starter templates** (Moodinfinite canvas). An empty board offers Moodboard, Flowchart, and Image grid. Each one places that layout on the canvas.
16. **Draw on a story frame** (Moodflow). Draw on the frame stores a stroke and paints it on the frame.
17. **Script view** (Moodflow). Script lists every frame's action and dialogue in one column. Edits show on the frames after returning to the board.
18. **Colors from an image** (Moodtone). From canvas image builds the palette from a picture on a Moodinfinite board, not only from the base hex.
19. **Send a palette to the canvas** (Moodtone and Moodinfinite canvas). Send to canvas drops the current swatches onto the board as filled boxes. Photo search and the web clipper still need services this app does not have.

## Next

The next list is clear. The first later item, starter templates, is now in the app. The rest stay below.

## Later

Larger work. Still no new board type.

1. **Photo search on the image tool** (Moodinfinite canvas, image). Needs a stock-library service this app does not have.
2. **Web clipper for the link tool** (Moodinfinite canvas, link). Needs a browser extension this app does not have.
3. **Subtasks** (Moodlist). Indent a row under the one above it.
4. **Prompt versions** (Moodprompt). Keep the previous text of a card when it changes, and put it back in one step.
5. **Shared boards.** Realtime editing is out of scope until the single-player finish above is in place. Local save and Drive sync stay the way work moves between machines.
