import fs = require('fs');
import path = require('path');

// calcLayoutInfo (layout.ts) sums field widths as pixels via parseInt and uses
// the total to derive proof orientation and zoom.  A non-pixel width unit
// (%, em, auto, or a bare number) would parse to a meaningless value and
// silently corrupt that sizing.  The proof-type schema therefore constrains
// field widths to an explicit pixel value; these tests guard that contract so
// it cannot be loosened without a failing build.
describe('proofType schema — field width', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schema/proofType.schema.json'), 'utf-8'));

  // proofSpec $refs overrideSpec, so this single field definition backs both
  // proof specs and their overrides.
  const widthSchema = schema.$defs.overrideSpec.properties.fields.items.properties.width;

  it('constrains width to a pixel value in the shared field definition', () => {
    expect(widthSchema).toMatchObject({ type: 'string', pattern: '^[0-9]+px$' });
  });

  it('accepts pixel widths and rejects every other form', () => {
    const widthPattern = new RegExp(widthSchema.pattern);

    for (const valid of ['1px', '20px', '100px', '1024px']) {
      expect(widthPattern.test(valid)).toBe(true);
    }

    for (const invalid of ['100', '50%', '2em', 'auto', '100 px', 'px', '100PX', '']) {
      expect(widthPattern.test(invalid)).toBe(false);
    }
  });
});
