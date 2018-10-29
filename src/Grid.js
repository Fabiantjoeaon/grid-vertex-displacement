export default class Grid {
    constructor(width = 1, height = 1, widthSegments, heightSegments) {
        this.width = width;
        this.height = height;
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;

        this.calculateAttributes();
    }

    calculateAttributes() {
        const gridX = Math.floor(this.widthSegments) || 1;
        const gridY = Math.floor(this.heightSegments) || 1;
        const gridXPlusOne = this.widthSegments + 1;
        const gridYPlusOne = this.heightSegments + 1;
        const segmentWidth = this.width / gridX;
        const segmentHeight = this.height / gridY;

        // CELLS = INDICES
        this.cells = [];
        // POSITIONS = VERTICES
        this.positions = [];
        this.normals = [];
        this.uvs = [];

        let ix;
        let iy;

        for (ix = 0; ix < gridXPlusOne; ix++) {
            const x = ix * segmentWidth - this.width / 2;

            for (iy = 0; iy < gridYPlusOne; iy++) {
                const y = iy * segmentHeight - this.height / 2;

                this.positions.push([x, -y, 0]);
                // STATIC!
                this.normals.push(0, 0, 1);
                this.uvs.push(ix / gridX);
                this.uvs.push(1 - iy / gridY);
            }
        }

        for (ix = 0; ix < gridX; ix++) {
            for (iy = 0; iy < gridY; iy++) {
                const a = ix + gridXPlusOne * iy;
                const b = ix + gridXPlusOne * (iy + 1);
                const c = ix + 1 + gridXPlusOne * (iy + 1);
                const d = ix + 1 + gridXPlusOne * iy;

                this.cells.push(a, b, d);
                this.cells.push(b, c, d);
            }
        }
    }
}
