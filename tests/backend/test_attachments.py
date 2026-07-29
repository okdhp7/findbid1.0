from app.repositories.external_bid_repository import ExternalBidRepository


def test_attachment_documents_are_normalized_and_classified() -> None:
    attachments = ExternalBidRepository._attachments(
        [
            {
                "name": "입찰공고문.pdf",
                "url": "https://www.g2b.go.kr/files/notice.pdf",
                "size": "보기",
            },
            {
                "name": "과업지시서.hwp",
                "url": "https://www.g2b.go.kr/files/specification.hwp",
                "size": "보기",
            },
            {
                "name": "산출내역서.xlsx",
                "url": "https://www.g2b.go.kr/files/budget.xlsx",
                "size": "보기",
            },
            {
                "name": "입찰공고문 (바로가기)",
                "url": "https://www.g2b.go.kr/link/notice",
                "size": "링크",
            },
        ]
    )

    assert [attachment["file_type"] for attachment in attachments] == [
        "PDF",
        "한글",
        "엑셀",
        "바로가기",
    ]
    assert attachments[0]["extension"] == "pdf"
    assert attachments[1]["extension"] == "hwp"
    assert attachments[2]["extension"] == "xlsx"


def test_attachment_documents_reject_unsafe_and_duplicate_urls() -> None:
    attachments = ExternalBidRepository._attachments(
        [
            {"name": "안전한 문서.pdf", "url": "https://example.com/a.pdf"},
            {"name": "중복 문서.pdf", "url": "https://example.com/a.pdf"},
            {"name": "위험한 문서", "url": "javascript:alert(1)"},
            "올바르지 않은 값",
        ]
    )

    assert len(attachments) == 1
    assert attachments[0]["name"] == "안전한 문서.pdf"


def test_search_columns_exclude_large_attachment_payload() -> None:
    assert "b.attachments" not in ExternalBidRepository._columns()
    assert "b.attachments" in ExternalBidRepository._columns(
        include_attachments=True
    )
