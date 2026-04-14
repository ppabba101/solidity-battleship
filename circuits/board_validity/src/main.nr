// Board validity circuit (fleet-layout edition).
//
// Proves that a private fleet layout (five ships, axis aligned, on a 10x10
// grid) stamps a legal occupancy mask whose Pedersen hash equals the public
// `commitment`. Ships are supplied in fixed order:
//     carrier(5), battleship(4), cruiser(3), submarine(3), destroyer(2)
// Each ship is (x, y, orientation) where orientation is 0 (horizontal) or
// 1 (vertical). The circuit:
//   1. Bounds-checks each ship.
//   2. Stamps it into a 100-cell board, asserting no overlap.
//   3. Pedersen-hashes [board || salt] and asserts equality with the public
//      commitment. The frontend must compute the same hash out-of-circuit so
//      it can be passed in as the public input; the responder rebuilds the
//      same board from its fleet layout and reproduces the hash exactly.

global BOARD_SIZE: u32 = 10;
global BOARD_CELLS: u32 = 100;

fn main(
    ship_x: [u32; 5],
    ship_y: [u32; 5],
    ship_o: [u32; 5],
    salt: Field,
    commitment: pub Field,
) {
    let ship_len: [u32; 5] = [5, 4, 3, 3, 2];

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

        // Stamp up to 5 cells (we unroll the max ship length); guard with
        // `k < len` so shorter ships only stamp their actual length.
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

    // Pedersen commitment binds the derived board + salt to `commitment`.
    let mut preimage: [Field; 101] = [0; 101];
    for i in 0..BOARD_CELLS {
        preimage[i] = board[i];
    }
    preimage[100] = salt;
    let computed = std::hash::pedersen_hash(preimage);
    assert(computed == commitment, "commitment mismatch");
}
