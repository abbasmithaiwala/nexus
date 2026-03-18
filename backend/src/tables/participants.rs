use spacetimedb::{Identity, SpacetimeType, Timestamp};

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub struct MediaState {
    pub audio_enabled: bool,
    pub video_enabled: bool,
    pub is_screen_sharing: bool,
}

#[spacetimedb::table(accessor = participant, public,
    index(accessor = participant_by_room, btree(columns = [room_id])),
    index(accessor = participant_by_identity, btree(columns = [identity]))
)]
pub struct Participant {
    #[primary_key]
    #[auto_inc]
    pub participant_id: u64,
    pub room_id: u64,
    pub identity: Identity,
    pub display_name: String,
    pub joined_at: Timestamp,
    pub left_at: Option<Timestamp>,
    pub is_host: bool,
    pub media_state: MediaState,
}
