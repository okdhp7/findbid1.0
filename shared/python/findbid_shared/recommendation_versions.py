SEARCH_PIPELINE_VERSION = 3
FINGERPRINT_SCHEMA_VERSION = 1
NORMALIZER_VERSION = 1
INTENT_PARSER_VERSION = 1
RANKING_MODEL_VERSION = "hybrid-2026-07-29.1"
FEEDBACK_POLICY_VERSION = 1


def recommendation_versions() -> dict[str, str | int]:
    return {
        "searchPipeline": SEARCH_PIPELINE_VERSION,
        "fingerprintSchema": FINGERPRINT_SCHEMA_VERSION,
        "normalizer": NORMALIZER_VERSION,
        "intentParser": INTENT_PARSER_VERSION,
        "rankingModel": RANKING_MODEL_VERSION,
        "feedbackPolicy": FEEDBACK_POLICY_VERSION,
    }
