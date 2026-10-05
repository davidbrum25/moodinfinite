/**
 * Drive the shipped draw() on a 200-item board and count steady-state
 * getItemBoundingBox calls plus the ids drawBoxItem actually paints.
 */
export async function measureHotPath(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('moodboard-canvas');
        const center = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 });
        const list = items;
        list.length = 0;
        const make = (id, x, y) => ({
            id, type: 'box', color: '#429eff', x, y, width: 8, height: 8,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        for (let i = 0; i < 100; i++) {
            list.push(make('near-' + i, center.x - 40 + (i % 10) * 8, center.y - 40 + Math.floor(i / 10) * 8));
        }
        for (let i = 0; i < 100; i++) {
            list.push(make('far-' + i, center.x + 30000 + (i % 10) * 20, center.y + 30000 + Math.floor(i / 10) * 20));
        }
        draw();
        const origBox = getItemBoundingBox;
        let bboxCalls = 0;
        getItemBoundingBox = function (item) {
            bboxCalls++;
            return origBox(item);
        };
        const origDrawBox = drawBoxItem;
        const visibleIds = [];
        drawBoxItem = function (ctx, item) {
            visibleIds.push(item.id);
            return origDrawBox(ctx, item);
        };
        draw();
        getItemBoundingBox = origBox;
        drawBoxItem = origDrawBox;
        visibleIds.sort();
        return {
            itemCount: list.length,
            bboxCalls,
            visibleIds,
            canvas: { width: canvas.width, height: canvas.height },
        };
    });
}
