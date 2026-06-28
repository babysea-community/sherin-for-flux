# Changelog

All notable changes will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Standardize Black Forest Labs BYOK form rendering around Semantic Lady schema fields.
- Separate image and video input handling for FLUX models while keeping shared UI media/file wording generic.
- Render Black Forest Labs duration as a bounded select control and use local field descriptions for Studio form help text.
- Expose a base64 image prompt field for Black Forest Labs Flux 1.x direct BYOK models.
- Treat Black Forest Labs Flux 1.x direct BYOK image prompts as base64-only by rejecting generic uploaded or linked input images before submission.

### Fixed

- Ignore stale form values that are outside the active FLUX models schema.
- Omit empty video input values from BYOK submissions so image-only FLUX models do not receive unsupported schema fields.
- Preserve durable input reference assets after terminal generation states so the References dashboard keeps displaying uploaded and URL-based inputs.

## [0.1.0] - 2026-06-26 - INITIAL RELEASED

- Implement FLUX models.
