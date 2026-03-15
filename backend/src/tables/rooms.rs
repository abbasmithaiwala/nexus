use spacetimedb::{Identity, SpacetimeType, Timestamp};

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum RoomStatus {
    Waiting,
    Active,
    Ended,
}

#[spacetimedb::table(accessor = room, public, index(accessor = room_by_code, btree(columns = [room_code])))]
pub struct Room {
    #[primary_key]
    #[auto_inc]
    pub room_id: u64,
    #[unique]
    pub room_code: String,
    pub title: String,
    pub host_identity: Identity,
    pub status: RoomStatus,
    pub created_at: Timestamp,
    pub ended_at: Option<Timestamp>,
}
