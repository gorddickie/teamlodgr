#!/usr/bin/env python3
"""
Sabre API test script for TeamLodgr
Tests authentication + hotel availability search
"""

import requests
import base64
import json

SABRE_USER_ID = "V1:5n4svlib3ihfuw2x:DEVCENTER:EXT"
SABRE_PASSWORD = "Jee4vU5E"
SABRE_BASE_URL = "https://api.cert.platform.sabre.com"  # cert/sandbox

def get_token():
    """Get OAuth token from Sabre — double base64 encoding required"""
    uid_b64 = base64.b64encode(SABRE_USER_ID.encode()).decode()
    pwd_b64 = base64.b64encode(SABRE_PASSWORD.encode()).decode()
    inner = base64.b64encode(f"{uid_b64}:{pwd_b64}".encode()).decode()
    resp = requests.post(
        f"{SABRE_BASE_URL}/v2/auth/token",
        headers={"Authorization": f"Basic {inner}", "Content-Type": "application/x-www-form-urlencoded"},
        data="grant_type=client_credentials"
    )
    print(f"Auth status: {resp.status_code}")
    if resp.status_code != 200:
        print("Auth failed:", resp.text)
        return None
    token = resp.json().get("access_token")
    print(f"Token: {token[:40]}...")
    return token

def search_hotels(token, city="Toronto", checkin="2026-06-15", checkout="2026-06-17", rooms=5):
    """Search hotel availability"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "GetHotelAvailRQ": {
            "POS": {
                "Source": {
                    "PseudoCityCode": "DEVCENTER"
                }
            },
            "SearchCriteria": {
                "HotelSearchCriterion": {
                    "HotelRef": {
                        "HotelCityCode": "YYZ"  # Toronto IATA
                    },
                    "StayDateRange": {
                        "StartDate": checkin,
                        "EndDate": checkout
                    },
                    "RoomStayCandidates": {
                        "RoomStayCandidate": {
                            "Quantity": rooms,
                            "GuestCounts": {
                                "GuestCount": {"AgeQualifyingCode": "10", "Count": 2}
                            }
                        }
                    }
                }
            }
        }
    }

    resp = requests.post(
        f"{SABRE_BASE_URL}/v4.1.0/get/hotelavail",
        headers=headers,
        json=payload
    )
    print(f"\nHotel search status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(json.dumps(data, indent=2)[:3000])
    else:
        print("Error:", resp.text[:1000])

if __name__ == "__main__":
    print("=== Sabre API Test ===\n")
    token = get_token()
    if token:
        search_hotels(token)
