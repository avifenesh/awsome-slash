use std::collections::{HashMap, HashSet};
use std::fmt;

pub struct PublicStruct {
    value: i32,
}
struct PrivateStruct {
    value: i32,
}

pub enum PublicEnum {
    One,
    Two,
}
pub trait PublicTrait {
    fn run(&self);
}

pub const PUBLIC_CONST: i32 = 1;
const PRIVATE_CONST: i32 = 2;

pub fn public_fn() -> i32 {
    1
}
fn private_fn() -> i32 {
    2
}
