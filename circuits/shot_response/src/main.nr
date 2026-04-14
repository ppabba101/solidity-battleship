// Shot response circuit.
//
// Proves that the responder's answer (hit or miss) at coordinate (x, y) is
// consistent with the private board previously committed to via Poseidon.
// Public inputs: commitment, x, y, hit. Private inputs: board, salt.

global BOARD_SIZE: u32 = 10;
global BOARD_CELLS: u32 = 100;

fn main(
    board: [Field; 100],
    salt: Field,
    commitment: pub Field,
    x: pub u32,
    y: pub u32,
    hit: pub Field,
) {
    assert(x < BOARD_SIZE, "x out of range");
    assert(y < BOARD_SIZE, "y out of range");
    assert((hit * (hit - 1)) == 0, "hit must be 0 or 1");

    let idx = y * BOARD_SIZE + x;
    let cell = board[idx];
    assert(cell == hit, "response does not match board");

    // Re-derive the commitment so the proof is bound to the committed board.
    let mut preimage: [Field; 101] = [0; 101];
    for i in 0..BOARD_CELLS {
        preimage[i] = board[i];
    }
    preimage[100] = salt;
    let computed = std::hash::pedersen_hash(preimage);
    assert(computed == commitment, "commitment mismatch");
}
