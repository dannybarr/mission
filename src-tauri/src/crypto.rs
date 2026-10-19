use crate::{Error, Result};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::Zeroizing;
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Header {
    pub version: u32,
    pub vault_id: Uuid,
    pub public_key: String,
    pub salt: String,
    pub nonce: String,
    pub kdf: String,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub header: Header,
    pub wrapped_key: String,
    pub signature: String,
}
fn derive(passphrase: &[u8], salt: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    let params = Params::new(65536, 3, 1, Some(32)).map_err(|_| Error::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(passphrase, salt, key.as_mut())
        .map_err(|_| Error::Crypto)?;
    Ok(key)
}
fn signed_bytes(header: &Header, wrapped: &str) -> Result<Vec<u8>> {
    Ok(serde_json::to_vec(&(header, wrapped))?)
}
impl Manifest {
    pub fn create(passphrase: &[u8]) -> Result<(Self, Zeroizing<[u8; 32]>)> {
        if passphrase.len() < 14 || passphrase.len() > 1024 {
            return Err(Error::Invalid);
        }
        let mut salt = [0u8; 16];
        let mut nonce = [0u8; 12];
        let mut key = Zeroizing::new([0u8; 32]);
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);
        OsRng.fill_bytes(key.as_mut());
        let signer = SigningKey::generate(&mut OsRng);
        let header = Header {
            version: 1,
            vault_id: Uuid::new_v4(),
            public_key: hex::encode(signer.verifying_key().as_bytes()),
            salt: hex::encode(salt),
            nonce: hex::encode(nonce),
            kdf: "argon2id-v19-m65536-t3-p1".into(),
        };
        let wrapping = derive(passphrase, &salt)?;
        let cipher = Aes256Gcm::new_from_slice(wrapping.as_ref()).map_err(|_| Error::Crypto)?;
        let aad = serde_json::to_vec(&header)?;
        let wrapped_key = hex::encode(
            cipher
                .encrypt(
                    Nonce::from_slice(&nonce),
                    Payload {
                        msg: key.as_ref(),
                        aad: &aad,
                    },
                )
                .map_err(|_| Error::Crypto)?,
        );
        let signature = hex::encode(
            signer
                .sign(&signed_bytes(&header, &wrapped_key)?)
                .to_bytes(),
        );
        Ok((
            Self {
                header,
                wrapped_key,
                signature,
            },
            key,
        ))
    }
    pub fn verify(&self) -> Result<()> {
        if self.header.version != 1 || self.header.kdf != "argon2id-v19-m65536-t3-p1" {
            return Err(Error::Crypto);
        }
        let public: [u8; 32] = hex::decode(&self.header.public_key)
            .map_err(|_| Error::Crypto)?
            .try_into()
            .map_err(|_| Error::Crypto)?;
        let signature =
            Signature::from_slice(&hex::decode(&self.signature).map_err(|_| Error::Crypto)?)
                .map_err(|_| Error::Crypto)?;
        VerifyingKey::from_bytes(&public)
            .map_err(|_| Error::Crypto)?
            .verify_strict(&signed_bytes(&self.header, &self.wrapped_key)?, &signature)
            .map_err(|_| Error::Crypto)
    }
    pub fn unlock(&self, passphrase: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
        if passphrase.len() > 1024 {
            return Err(Error::Invalid);
        }
        self.verify()?;
        let salt = hex::decode(&self.header.salt).map_err(|_| Error::Crypto)?;
        let nonce = hex::decode(&self.header.nonce).map_err(|_| Error::Crypto)?;
        let wrapped = hex::decode(&self.wrapped_key).map_err(|_| Error::Crypto)?;
        if salt.len() != 16 || nonce.len() != 12 || wrapped.len() != 48 {
            return Err(Error::Crypto);
        }
        let wrapping = derive(passphrase, &salt)?;
        let cipher = Aes256Gcm::new_from_slice(wrapping.as_ref()).map_err(|_| Error::Crypto)?;
        let aad = serde_json::to_vec(&self.header)?;
        let plaintext = Zeroizing::new(
            cipher
                .decrypt(
                    Nonce::from_slice(&nonce),
                    Payload {
                        msg: &wrapped,
                        aad: &aad,
                    },
                )
                .map_err(|_| Error::Crypto)?,
        );
        if plaintext.len() != 32 {
            return Err(Error::Crypto);
        }
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&plaintext);
        Ok(key)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wrapping_round_trip_and_wrong_passphrase() {
        let (m, key) = Manifest::create(b"a sufficiently long passphrase").unwrap();
        assert_eq!(*key, *m.unlock(b"a sufficiently long passphrase").unwrap());
        assert!(m.unlock(b"a different passphrase").is_err());
    }
    #[test]
    fn tampered_manifest_is_rejected() {
        let (mut m, _) = Manifest::create(b"a sufficiently long passphrase").unwrap();
        m.header.vault_id = Uuid::new_v4();
        assert!(m.verify().is_err());
    }
    #[test]
    fn rejects_short_passphrase() {
        assert!(Manifest::create(b"short").is_err());
    }
}
