#!/usr/bin/env bash

echo "$@"

BASE_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
STUDY_FILE="StudyUtils.jsm"
STUDY_DEST_FILE="${BASE_DIR}/addon/${STUDY_FILE}"
STUDY_SOURCE_FILE="${BASE_DIR}/node_modules/shield-studies-addon-utils/dist/${STUDY_FILE}"
PATCH_FILE="${BASE_DIR}/addon/StudyUtils.patch"

diff "${STUDY_SOURCE_FILE}" "${STUDY_DEST_FILE}" > "${PATCH_FILE}"
cp "${STUDY_SOURCE_FILE}" "${STUDY_DEST_FILE}"
patch "${STUDY_DEST_FILE}" "${PATCH_FILE}"
