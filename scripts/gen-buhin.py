"""
gen-buhin.py - JW_CAD用 内装仕上げ部品DXFファイル生成スクリプト

出力先: C:/JWW/図形/内装部品/
形式: DXF R2010, 単位mm, 1:1スケール
"""

import os
import math
import ezdxf

OUTPUT_DIR = r"C:\JWW\図形\内装部品"


def save_dxf(doc: ezdxf.document.Drawing, filename: str) -> str:
    """Save DXF file to the output directory and return the full path."""
    path = os.path.join(OUTPUT_DIR, filename)
    doc.saveas(path)
    return path


def new_doc() -> ezdxf.document.Drawing:
    """Create a new DXF R2010 document with mm units."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4  # mm
    doc.header["$MEASUREMENT"] = 1  # metric
    return doc


# ---------------------------------------------------------------------------
# Doors (平面図用)
# ---------------------------------------------------------------------------

def gen_single_swing_door(width: int):
    """
    片開きドア - Single swing door.
    Hinge point at origin (0,0). Door swings inward (90° arc).
    Wall opening shown as a gap. Door panel is a thick line.
    """
    doc = new_doc()
    msp = doc.modelspace()

    wall_thickness = 120  # typical wall thickness for context

    # Wall opening - two short wall stubs to show the opening
    # Left wall stub (before hinge)
    msp.add_line((-300, 0), (0, 0), dxfattribs={"layer": "0"})
    # Right wall stub (after opening)
    msp.add_line((width, 0), (width + 300, 0), dxfattribs={"layer": "0"})

    # Door panel - thick line from hinge point, swung open at 90°
    # When open, door extends upward from hinge
    msp.add_line(
        (0, 0), (0, width),
        dxfattribs={"layer": "0", "lineweight": 50}  # 0.50mm thick
    )

    # 90° swing arc from closed position to open position
    # Closed position: door lies along wall (positive X)
    # Open position: door perpendicular to wall (positive Y)
    msp.add_arc(
        center=(0, 0),
        radius=width,
        start_angle=0,
        end_angle=90,
        dxfattribs={"layer": "0"}
    )

    save_dxf(doc, f"片開きドア_{width}.dxf")


def gen_sliding_door(width: int):
    """
    引戸 - Sliding door.
    Door slides along the wall. Opening centered at origin.
    """
    doc = new_doc()
    msp = doc.modelspace()

    if width == 1800:
        # Double sliding door - two panels sliding in opposite directions
        panel_w = width // 2  # 900 each

        # Wall opening
        msp.add_line((-300, 0), (0, 0), dxfattribs={"layer": "0"})
        msp.add_line((width, 0), (width + 300, 0), dxfattribs={"layer": "0"})

        # Left panel (slides left) - shown slightly offset from wall line
        msp.add_line(
            (0, 30), (panel_w, 30),
            dxfattribs={"layer": "0", "lineweight": 50}
        )
        # Right panel (slides right)
        msp.add_line(
            (panel_w, -30), (width, -30),
            dxfattribs={"layer": "0", "lineweight": 50}
        )

        # Arrows showing slide direction
        # Left arrow
        _draw_arrow(msp, (panel_w // 2, 30), angle=180, length=150)
        # Right arrow
        _draw_arrow(msp, (panel_w + panel_w // 2, -30), angle=0, length=150)

    else:
        # Single sliding door
        # Wall opening
        msp.add_line((-300, 0), (0, 0), dxfattribs={"layer": "0"})
        msp.add_line((width, 0), (width + 300, 0), dxfattribs={"layer": "0"})

        # Door panel - offset slightly from wall line
        msp.add_line(
            (0, 30), (width, 30),
            dxfattribs={"layer": "0", "lineweight": 50}
        )

        # Arrow showing slide direction (slides to the right, behind wall)
        _draw_arrow(msp, (width // 2, 30), angle=0, length=200)

    save_dxf(doc, f"引戸_{width}.dxf")


def _draw_arrow(msp, tip, angle=0, length=150):
    """Draw a simple arrow. angle in degrees, 0=right, 180=left."""
    rad = math.radians(angle)
    tail = (tip[0] - length * math.cos(rad), tip[1] - length * math.sin(rad))

    # Shaft
    msp.add_line(tail, tip, dxfattribs={"layer": "0"})

    # Arrowhead (two short lines at ±30° from shaft direction)
    head_len = length * 0.25
    for sign in [1, -1]:
        a = rad + math.radians(180 + sign * 30)
        end = (tip[0] + head_len * math.cos(a), tip[1] + head_len * math.sin(a))
        msp.add_line(tip, end, dxfattribs={"layer": "0"})


def gen_folding_door(width: int):
    """
    折戸 - Folding door (bifold).
    Two panels fold together in a zigzag pattern.
    """
    doc = new_doc()
    msp = doc.modelspace()

    panel_w = width / 2  # each panel half the total width

    # Wall opening
    msp.add_line((-300, 0), (0, 0), dxfattribs={"layer": "0"})
    msp.add_line((width, 0), (width + 300, 0), dxfattribs={"layer": "0"})

    # Folded panels shown as zigzag (partially open state)
    # Hinge at left side (0,0), fold point in middle, end near right
    fold_depth = panel_w * 0.5  # how far panels protrude when folded

    # Panel 1: from hinge to fold point
    fold_x = panel_w * 0.4
    msp.add_line(
        (0, 0), (fold_x, fold_depth),
        dxfattribs={"layer": "0", "lineweight": 50}
    )

    # Panel 2: from fold point back toward wall
    msp.add_line(
        (fold_x, fold_depth), (fold_x + panel_w * 0.4, 0),
        dxfattribs={"layer": "0", "lineweight": 50}
    )

    # Small circle at fold joint
    msp.add_circle((fold_x, fold_depth), radius=10, dxfattribs={"layer": "0"})

    save_dxf(doc, f"折戸_{width}.dxf")


# ---------------------------------------------------------------------------
# Electrical symbols (平面図用)
# ---------------------------------------------------------------------------

def gen_outlet():
    """
    コンセント - Wall outlet symbol (JIS standard).
    Semicircle on the wall line. Wall runs horizontally through origin.
    """
    doc = new_doc()
    msp = doc.modelspace()

    r = 75  # radius of semicircle

    # Wall line
    msp.add_line((-150, 0), (150, 0), dxfattribs={"layer": "0"})

    # Semicircle protruding from wall (upward)
    msp.add_arc(
        center=(0, 0),
        radius=r,
        start_angle=0,
        end_angle=180,
        dxfattribs={"layer": "0"}
    )

    # Two short parallel lines inside semicircle representing prongs
    prong_len = 30
    for offset in [-20, 20]:
        msp.add_line(
            (offset, 10), (offset, 10 + prong_len),
            dxfattribs={"layer": "0"}
        )

    save_dxf(doc, "コンセント.dxf")


def gen_switch():
    """
    スイッチ - Light switch symbol (JIS standard).
    Filled circle with 'S' label.
    """
    doc = new_doc()
    msp = doc.modelspace()

    r = 40

    # Wall line
    msp.add_line((-150, 0), (150, 0), dxfattribs={"layer": "0"})

    # Switch circle on wall
    msp.add_circle((0, 0), radius=r, dxfattribs={"layer": "0"})

    # Filled dot in center (small solid circle)
    msp.add_circle((0, 0), radius=8, dxfattribs={"layer": "0"})
    # Use hatch to fill the small circle
    hatch = msp.add_hatch(color=7, dxfattribs={"layer": "0"})
    hatch.paths.add_polyline_path(
        [(8 * math.cos(math.radians(a)), 8 * math.sin(math.radians(a)))
         for a in range(0, 360, 10)],
        is_closed=True
    )

    # 'S' label
    msp.add_text(
        "S",
        height=50,
        dxfattribs={"layer": "0", "insert": (r + 15, -20)}
    )

    save_dxf(doc, "スイッチ.dxf")


def gen_downlight():
    """
    ダウンライト - Downlight symbol.
    Circle with cross (X) inside.
    """
    doc = new_doc()
    msp = doc.modelspace()

    r = 75  # typical downlight symbol radius

    # Outer circle
    msp.add_circle((0, 0), radius=r, dxfattribs={"layer": "0"})

    # Cross inside
    d = r * 0.7
    msp.add_line((-d, -d), (d, d), dxfattribs={"layer": "0"})
    msp.add_line((-d, d), (d, -d), dxfattribs={"layer": "0"})

    save_dxf(doc, "ダウンライト.dxf")


def gen_fluorescent():
    """
    蛍光灯 - Fluorescent light symbol.
    Rectangle representing the fixture.
    """
    doc = new_doc()
    msp = doc.modelspace()

    # Standard fluorescent light fixture ~1200x150mm in plan
    w = 1200
    h = 150

    # Rectangle centered at origin
    points = [
        (-w / 2, -h / 2),
        (w / 2, -h / 2),
        (w / 2, h / 2),
        (-w / 2, h / 2),
        (-w / 2, -h / 2),  # close
    ]
    msp.add_lwpolyline(points, dxfattribs={"layer": "0"})

    # Center line along length (typical drawing convention)
    msp.add_line((-w / 2 + 30, 0), (w / 2 - 30, 0), dxfattribs={"layer": "0"})

    save_dxf(doc, "蛍光灯.dxf")


# ---------------------------------------------------------------------------
# Plumbing/Fixtures (平面図用)
# ---------------------------------------------------------------------------

def gen_toilet():
    """
    トイレ - Toilet plan view.
    Tank (rectangle at back) + bowl (oval front). ~400x700mm overall.
    Origin at center-back (wall side).
    """
    doc = new_doc()
    msp = doc.modelspace()

    tank_w = 380
    tank_d = 180
    bowl_w = 360
    bowl_d = 480
    total_d = tank_d + bowl_d  # ~660mm

    # Tank rectangle (at back, near wall)
    msp.add_lwpolyline([
        (-tank_w / 2, 0),
        (tank_w / 2, 0),
        (tank_w / 2, tank_d),
        (-tank_w / 2, tank_d),
        (-tank_w / 2, 0),
    ], dxfattribs={"layer": "0"})

    # Bowl - oval (ellipse) in front of tank
    # Major axis must be the longer dimension; ratio must be <= 1.0
    bowl_center_y = tank_d + bowl_d / 2
    msp.add_ellipse(
        center=(0, bowl_center_y),
        major_axis=(0, bowl_d / 2, 0),  # major along Y (depth is longer)
        ratio=bowl_w / bowl_d,  # minor/major <= 1.0
        dxfattribs={"layer": "0"}
    )

    # Seat opening - smaller oval inside
    seat_w = bowl_w * 0.65
    seat_d = bowl_d * 0.6
    msp.add_ellipse(
        center=(0, bowl_center_y + 20),
        major_axis=(0, seat_d / 2, 0),  # major along Y
        ratio=seat_w / seat_d,  # minor/major <= 1.0
        dxfattribs={"layer": "0"}
    )

    save_dxf(doc, "トイレ.dxf")


def gen_vanity():
    """
    洗面台 - Vanity sink plan view. ~600x450mm.
    Rectangle cabinet with oval basin.
    Origin at center of back edge (wall side).
    """
    doc = new_doc()
    msp = doc.modelspace()

    w = 600
    d = 450

    # Cabinet outline
    msp.add_lwpolyline([
        (-w / 2, 0),
        (w / 2, 0),
        (w / 2, d),
        (-w / 2, d),
        (-w / 2, 0),
    ], dxfattribs={"layer": "0"})

    # Basin (oval) centered in cabinet
    basin_w = 380
    basin_d = 280
    basin_cy = d / 2 + 20  # slightly forward

    msp.add_ellipse(
        center=(0, basin_cy),
        major_axis=(basin_w / 2, 0, 0),
        ratio=basin_d / basin_w,
        dxfattribs={"layer": "0"}
    )

    # Faucet dot
    msp.add_circle((0, 60), radius=15, dxfattribs={"layer": "0"})

    save_dxf(doc, "洗面台.dxf")


def gen_kitchen_sink():
    """
    流し台 - Kitchen sink plan view. ~800x600mm.
    Rectangle counter with double basin rectangles.
    Origin at center of back edge (wall side).
    """
    doc = new_doc()
    msp = doc.modelspace()

    w = 800
    d = 600

    # Counter outline
    msp.add_lwpolyline([
        (-w / 2, 0),
        (w / 2, 0),
        (w / 2, d),
        (-w / 2, d),
        (-w / 2, 0),
    ], dxfattribs={"layer": "0"})

    # Double basin - two rectangles side by side
    basin_w = 280
    basin_d = 380
    gap = 40  # gap between basins
    basin_y_start = (d - basin_d) / 2 + 30  # offset from back

    for sign in [-1, 1]:
        bx = sign * (gap / 2 + basin_w / 2)
        msp.add_lwpolyline([
            (bx - basin_w / 2, basin_y_start),
            (bx + basin_w / 2, basin_y_start),
            (bx + basin_w / 2, basin_y_start + basin_d),
            (bx - basin_w / 2, basin_y_start + basin_d),
            (bx - basin_w / 2, basin_y_start),
        ], dxfattribs={"layer": "0"})

        # Drain circle in each basin
        msp.add_circle(
            (bx, basin_y_start + basin_d / 2),
            radius=20,
            dxfattribs={"layer": "0"}
        )

    # Faucet between basins
    msp.add_circle((0, basin_y_start - 30), radius=15, dxfattribs={"layer": "0"})

    save_dxf(doc, "流し台.dxf")


# ---------------------------------------------------------------------------
# Furniture (平面図用)
# ---------------------------------------------------------------------------

def gen_table():
    """
    テーブル 900x900mm - Square table plan view.
    Centered at origin.
    """
    doc = new_doc()
    msp = doc.modelspace()

    s = 900  # side length
    h = s / 2

    msp.add_lwpolyline([
        (-h, -h),
        (h, -h),
        (h, h),
        (-h, h),
        (-h, -h),
    ], dxfattribs={"layer": "0"})

    save_dxf(doc, "テーブル_900x900.dxf")


def gen_chair():
    """
    椅子 - Chair plan view. ~450x450mm.
    Seat square with backrest line. Centered at origin.
    """
    doc = new_doc()
    msp = doc.modelspace()

    seat_w = 420
    seat_d = 400
    back_w = 420
    back_d = 50

    # Seat
    msp.add_lwpolyline([
        (-seat_w / 2, -seat_d / 2),
        (seat_w / 2, -seat_d / 2),
        (seat_w / 2, seat_d / 2),
        (-seat_w / 2, seat_d / 2),
        (-seat_w / 2, -seat_d / 2),
    ], dxfattribs={"layer": "0"})

    # Backrest (thicker rectangle at back)
    back_y = seat_d / 2
    msp.add_lwpolyline([
        (-back_w / 2, back_y),
        (back_w / 2, back_y),
        (back_w / 2, back_y + back_d),
        (-back_w / 2, back_y + back_d),
        (-back_w / 2, back_y),
    ], dxfattribs={"layer": "0", "lineweight": 30})

    save_dxf(doc, "椅子.dxf")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Generating interior component DXF files to: {OUTPUT_DIR}")
    print("=" * 60)

    # --- Doors ---
    print("\n[Doors]")
    for w in [700, 800, 900]:
        gen_single_swing_door(w)
        print(f"  片開きドア_{w}.dxf")

    gen_sliding_door(900)
    print("  引戸_900.dxf")
    gen_sliding_door(1800)
    print("  引戸_1800.dxf")

    gen_folding_door(800)
    print("  折戸_800.dxf")

    # --- Electrical ---
    print("\n[Electrical symbols]")
    gen_outlet()
    print("  コンセント.dxf")
    gen_switch()
    print("  スイッチ.dxf")
    gen_downlight()
    print("  ダウンライト.dxf")
    gen_fluorescent()
    print("  蛍光灯.dxf")

    # --- Plumbing/Fixtures ---
    print("\n[Plumbing/Fixtures]")
    gen_toilet()
    print("  トイレ.dxf")
    gen_vanity()
    print("  洗面台.dxf")
    gen_kitchen_sink()
    print("  流し台.dxf")

    # --- Furniture ---
    print("\n[Furniture]")
    gen_table()
    print("  テーブル_900x900.dxf")
    gen_chair()
    print("  椅子.dxf")

    # --- Summary ---
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"{'File':<30} {'Size (KB)':>10}")
    print("-" * 42)

    total_size = 0
    files = sorted(os.listdir(OUTPUT_DIR))
    for f in files:
        if f.endswith(".dxf"):
            path = os.path.join(OUTPUT_DIR, f)
            size = os.path.getsize(path)
            total_size += size
            print(f"  {f:<28} {size / 1024:>8.1f}")

    print("-" * 42)
    print(f"  {'Total':<28} {total_size / 1024:>8.1f}")
    print(f"\n{len([f for f in files if f.endswith('.dxf')])} DXF files generated successfully.")


if __name__ == "__main__":
    main()
