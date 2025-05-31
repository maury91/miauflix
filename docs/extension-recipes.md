## 🛠️ Extension Recipes

### ➕ Add New Route

1. `src/routes/` → `my.routes.ts`.
2. Implement handlers; apply `authGuard` if protected.
3. Mount in `src/app.ts`: `app.route('/my', createMyRoutes())`.
4. Add tests → `npm run test:backend`.

### 🌐 Add Torrent Provider

1. `src/trackers/<provider>/` with API client.
2. Extend `tracker.service.ts` to include provider.
3. Add env vars if needed.
4. Adapt entities only if new fields.
5. Unit tests & verify `/status` reflects provider.

### 🔒 Encrypt DB Field

Database field encryption is implemented using AES-256-GCM with the [`EncryptionService`](../backend/src/services/encryption/encryption.service.ts).

**Current Implementation**: Encryption/decryption is handled at the repository layer rather than entity transformers, since the encryption service needs to be injected and isn't available during entity initialization.

Example usage in repositories:

1. **Repository-level encryption** (current approach):

   ```typescript
   // In MovieSourceRepository
   private encryptSource(source: Partial<MovieSource>): Partial<MovieSourceEntity> {
     const { hash, magnetLink, torrentFile, ...rest } = source;
     return {
       ...rest,
       ih: hash ? this.encryptionService.encryptString(hash, true) : undefined,
       ml: magnetLink ? this.encryptionService.encryptString(magnetLink) : undefined,
       file: torrentFile ? this.encryptionService.encryptBuffer(torrentFile) : undefined,
     };
   }
   ```

2. **Future: Entity-level transformers** (potential improvement):

   ```typescript
   // Would require making EncryptionService available statically
   @Column({
     type: 'text',
     transformer: {
       to: (value?: string) => value ? EncryptionService.encrypt(value) : undefined,
       from: (encrypted?: string) => encrypted ? EncryptionService.decrypt(encrypted) : undefined,
     }
   })
   sensitiveField: string;
   ```

3. **Use deterministic encryption for searchable fields**:

   ```typescript
   // For fields that need to be searchable/unique
   encryptionService.encryptString(hash, true); // deterministic = true
   ```

4. **Run migration script to encrypt existing data**:

   ```bash
   npx ts-node scripts/migrate-encrypt.ts
   ```

5. **Confirm ciphertext in DB shows encrypted format**.

**Note**: Torrent identifiers (hash, magnet links, torrent files) are now encrypted by default in [`MovieSourceRepository`](../backend/src/repositories/movie-source.repository.ts). The encryption service is injected into repositories where it can be properly initialized.
