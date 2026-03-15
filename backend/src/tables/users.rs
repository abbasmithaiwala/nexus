use spacetimedb::{Identity, Timestamp};

#[spacetimedb::table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub display_name: String,
    pub created_at: Timestamp,
}
