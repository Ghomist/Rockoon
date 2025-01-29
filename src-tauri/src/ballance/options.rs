use serde::{Deserialize, Serialize};

use super::tdb::{VtValue, TDB};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BallanceOptions {
    volume: f32,
    sync_to_screen: bool,
    key_forward: i32,
    key_backward: i32,
    key_left: i32,
    key_right: i32,
    key_rotate_cam: i32,
    key_lift_cam: i32,
    invert_cam_rotation: bool,
    cloud_layer: bool,
    last_player: String,
    level_lock: [bool; 12],
    highscores: [[BallanceHighscore; 10]; 13],
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BallanceHighscore {
    player: String,
    score: i32,
}

impl BallanceHighscore {
    pub fn new(player: String, score: i32) -> Self {
        Self { player, score }
    }
}

impl BallanceOptions {
    pub fn new() -> Self {
        Self {
            volume: 0.0,
            sync_to_screen: false,
            key_forward: 0,
            key_backward: 0,
            key_left: 0,
            key_right: 0,
            key_rotate_cam: 0,
            key_lift_cam: 0,
            invert_cam_rotation: false,
            cloud_layer: false,
            last_player: "".into(),
            level_lock: [false; 12],
            highscores: core::array::from_fn(|_| {
                core::array::from_fn(|_| BallanceHighscore::new("".into(), 0))
            }),
        }
    }

    pub fn read_from(&mut self, tdb: &TDB) {
        let table = tdb.get_table("DB_Options");
        self.volume = table[0][0].to_float();
        self.sync_to_screen = table[1][0].to_bool();
        self.key_forward = table[2][0].to_int();
        self.key_backward = table[3][0].to_int();
        self.key_left = table[4][0].to_int();
        self.key_right = table[5][0].to_int();
        self.key_rotate_cam = table[6][0].to_int();
        self.key_lift_cam = table[7][0].to_int();
        self.invert_cam_rotation = table[8][0].to_bool();
        self.last_player = table[9][0].to_string();
        self.cloud_layer = table[10][0].to_bool();

        let table = tdb.get_table("DB_Levelfreischaltung");
        let col = &table[0];
        for i in 0..12 {
            self.level_lock[i] = col[i].to_bool();
        }

        for i in 0..13 {
            let level = i + 1;
            let table_name = format!(
                "DB_Highscore_Lv{}",
                if level < 10 {
                    format!("0{}", level)
                } else {
                    level.to_string()
                }
            );
            let table = tdb.get_table(&table_name);
            for j in 0..10 {
                self.highscores[i][j].player = table[0][j].to_string();
                self.highscores[i][j].score = table[1][j].to_int();
            }
        }
    }

    pub fn write_to(&mut self, tdb: &mut TDB) {
        let vol = self.volume * 100.0;
        let vol = vol.round();
        self.volume = vol / 100.0;

        let table = tdb.get_table_mut("DB_Options");
        table[0][0] = VtValue::new(&(self.volume).to_le_bytes());
        table[1][0] = VtValue::new(&(self.sync_to_screen as i32).to_le_bytes());
        table[2][0] = VtValue::new(&(self.key_forward as i32).to_le_bytes());
        table[3][0] = VtValue::new(&(self.key_backward as i32).to_le_bytes());
        table[4][0] = VtValue::new(&(self.key_left as i32).to_le_bytes());
        table[5][0] = VtValue::new(&(self.key_right as i32).to_le_bytes());
        table[6][0] = VtValue::new(&(self.key_rotate_cam as i32).to_le_bytes());
        table[7][0] = VtValue::new(&(self.key_lift_cam as i32).to_le_bytes());
        table[8][0] = VtValue::new(&(self.invert_cam_rotation as i32).to_le_bytes());
        table[9][0] = VtValue::new(self.last_player.as_bytes());
        table[10][0] = VtValue::new(&(self.cloud_layer as i32).to_le_bytes());

        let table = tdb.get_table_mut("DB_Levelfreischaltung");
        let col = &mut table[0];
        for i in 0..12 {
            // col[i] = VtValue::new(&(if self.unlocked[i] { 1_i32 } else { 0_i32 }).to_le_bytes());
            col[i] = VtValue::new(&(self.level_lock[i] as i32).to_le_bytes());
        }

        for i in 0..13 {
            let level = i + 1;
            let table_name = format!(
                "DB_Highscore_Lv{}",
                if level < 10 {
                    format!("0{}", level)
                } else {
                    level.to_string()
                }
            );
            let table = tdb.get_table_mut(&table_name);
            for j in 0..10 {
                table[0][j] = VtValue::new(self.highscores[i][j].player.as_bytes());
                table[1][j] = VtValue::new(&(self.highscores[i][j].score).to_le_bytes());
            }
        }
    }
}

/*
pub fn get_key_name(index: i32) -> &'static str {
    KEY_MAP[index as usize]
}

const KEY_MAP: [&str; 72] = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "0",
    "-",
    "=",
    "BackSpace",
    "Tab",
    "Q",
    "W",
    "E",
    "R",
    "T",
    "Y",
    "U",
    "I",
    "O",
    "P",
    "[",
    "]",
    "Ctrl",
    "A",
    "S",
    "D",
    "F",
    "G",
    "H",
    "J",
    "K",
    "L",
    ";",
    "'",
    "`",
    "Shift",
    "\\",
    "Z",
    "X",
    "C",
    "V",
    "B",
    "N",
    "M",
    ",",
    ".",
    "/",
    "Right Shift",
    "Alt",
    "Space",
    "Num 7",
    "Num 8",
    "Num 9",
    "Num -",
    "Num 4",
    "Num 5",
    "Num 6",
    "Num +",
    "Num 1",
    "Num 2",
    "Num 3",
    "Num 0",
    "Num Del",
    "<",
    "Up",
    "Down",
    "Left",
    "Right",
];
*/
