// Shot response circuit (zk-verified ship sinking edition).
//
// Proves that:
//   1. The responder's answer (hit/miss) at coordinate (x, y) is consistent
//      with a private fleet layout whose Pedersen hash matches `commitment`.
//   2. Given a public `hit_bitmap_before` (the shooter's confirmed hits on the
//      responder so far, one Field per cell, 0 or 1), the updated post-shot
//      bitmap exactly sinks at most one ship, and the circuit outputs its
//      canonical 1..=5 index as `sunk_ship_id` (or 0 if none).
//
// Public inputs: commitment, x, y, hit, hit_bitmap_before[100], sunk_ship_id.
// Private inputs: ship_x[5], ship_y[5], ship_o[5], salt.

global BOARD_SIZE: u32 = 10;
global BOARD_CELLS: u32 = 100;

fn main(
    ship_x: [u32; 5],
    ship_y: [u32; 5],
    ship_o: [u32; 5],
    salt: Field,
    commitment: pub Field,
    x: pub u32,
    y: pub u32,
    hit: pub Field,
    hit_bitmap_before: pub [Field; 100],
    sunk_ship_id: pub Field,
) {
    let ship_len: [u32; 5] = [5, 4, 3, 3, 2];

    // --- 1. Reconstruct the board from the private fleet layout. -----------
    let mut board: [Field; 100] = [0; 100];
    for s in 0..5 {
        let x0 = ship_x[s];
        let y0 = ship_y[s];
        let o = ship_o[s];
        assert((o == 0) | (o == 1), "orientation must be 0 or 1");
        let len = ship_len[s];

        if o == 0 {
            assert(x0 + len <= BOARD_SIZE, "horizontal ship out of bounds");
            assert(y0 < BOARD_SIZE, "y out of bounds");
        } else {
            assert(y0 + len <= BOARD_SIZE, "vertical ship out of bounds");
            assert(x0 < BOARD_SIZE, "x out of bounds");
        }

        for k in 0..5 {
            if k < len {
                let dx = if o == 0 { k } else { 0 };
                let dy = if o == 0 { 0 } else { k };
                let idx = (y0 + dy) * BOARD_SIZE + (x0 + dx);
                assert(board[idx] == 0, "ships overlap");
                board[idx] = 1;
            }
        }
    }

    // --- 2. Re-derive and check the Pedersen commitment. -------------------
    let mut preimage: [Field; 101] = [0; 101];
    for i in 0..BOARD_CELLS {
        preimage[i] = board[i];
    }
    preimage[100] = salt;
    let computed = std::hash::pedersen_hash(preimage);
    assert(computed == commitment, "commitment mismatch");

    // --- 3. Verify the declared hit value at (x, y). -----------------------
    assert(x < BOARD_SIZE, "x out of range");
    assert(y < BOARD_SIZE, "y out of range");
    assert((hit * (hit - 1)) == 0, "hit must be 0 or 1");
    let shot_idx = y * BOARD_SIZE + x;
    assert(board[shot_idx] == hit, "response does not match board");

    // --- 4. Constrain every hit_bitmap_before entry to be 0 or 1. ----------
    for i in 0..BOARD_CELLS {
        let b = hit_bitmap_before[i];
        assert((b * (b - 1)) == 0, "bitmap bit must be 0 or 1");
    }

    // --- 5. Compute hit_bitmap_after. --------------------------------------
    // after[i] = before[i] OR (hit==1 AND i==shot_idx). Since before[i] is
    // already 0 or 1, and at most one new bit is set, we can implement OR as
    // `before[i] + delta` where delta is the new bit contribution.
    let mut bitmap_after: [Field; 100] = [0; 100];
    for i in 0..BOARD_CELLS {
        let is_this_cell: Field = (i == shot_idx) as Field;
        let delta: Field = is_this_cell * hit;
        // If before[i] is already 1 at this cell and we also hit it, the
        // board match above guarantees `hit == board[shot_idx] == 1`, and the
        // board has no duplicate fires - but the contract is the one that
        // prevents double-fires. For safety we fold with OR semantics: since
        // before[i]+delta is in {0,1,2}, clamp back to {0,1} via boolean.
        // However, in practice the contract stores the canonical bitmap so
        // double-fires never reach the circuit. We assert before+delta <= 1
        // to make that invariant explicit.
        // before[i] in {0,1} and delta in {0,1}; contract prevents double-fire
        // so (before * delta) must be 0. Enforce it to guarantee sum in {0,1}.
        assert(hit_bitmap_before[i] * delta == 0, "no double-fire");
        bitmap_after[i] = hit_bitmap_before[i] + delta;
    }

    // --- 6. For each ship, count its cells covered by bitmap_after. --------
    // Use constant ship coordinates (already validated above). We read
    // bitmap_after[cell_idx] directly - Noir handles variable-index array
    // reads via witness hints.
    let mut computed_sunk: Field = 0;
    for s in 0..5 {
        let len = ship_len[s];
        let x0 = ship_x[s];
        let y0 = ship_y[s];
        let o = ship_o[s];
        let mut covered: Field = 0;
        let mut touched_by_this_shot: Field = 0;
        for k in 0..5 {
            if k < len {
                let dx = if o == 0 { k } else { 0 };
                let dy = if o == 0 { 0 } else { k };
                let cell_idx = (y0 + dy) * BOARD_SIZE + (x0 + dx);
                covered = covered + bitmap_after[cell_idx];
                // Did this shot hit this specific ship cell?
                let matches: Field = (cell_idx == shot_idx) as Field;
                touched_by_this_shot = touched_by_this_shot + matches;
            }
        }
        // newly_sunk = is_sunk AND touched AND hit. Since ships do not overlap,
        // at most one ship can be newly sunk per shot.
        let is_sunk: Field = (covered == (len as Field)) as Field;
        let newly_sunk: Field = is_sunk * touched_by_this_shot * hit;
        let this_id: Field = ((s + 1) as Field) * newly_sunk;
        computed_sunk = computed_sunk + this_id;
    }

    assert(sunk_ship_id == computed_sunk, "sunk_ship_id mismatch");
}
