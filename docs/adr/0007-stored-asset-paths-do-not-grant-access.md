# A stored asset path does not grant access

Keep provider-relative paths ([ADR 0004](0004-store-asset-paths-relative.md)) as file identifiers, not as credentials. Unlike public-by-link files, customer attachments must follow the Customer’s access rule even if the path is shared; a draft upload is private to its uploader until attached. Storage providers can change without changing that access contract.
