use spacetimedb::{Identity, SpacetimeType, Timestamp};

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum SignalingMessageType {
    Offer,
    Answer,
    IceCandidate,
}

#[spacetimedb::table(
    accessor = signaling_message,
    public,
    index(accessor = signaling_by_room, btree(columns = [room_id])),
    index(accessor = signaling_by_recipient, btree(columns = [to_identity]))
)]
pub struct SignalingMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub room_id: u64,
    pub from_identity: Identity,
    pub to_identity: Identity,
    pub message_type: SignalingMessageType,
    /// JSON-encoded SDP or ICE candidate payload
    pub payload: String,
    pub created_at: Timestamp,
}
