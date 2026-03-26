#!/usr/bin/env python3
"""
Backend API Testing for CrickApp
Tests the FastAPI backend endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from the review request
BACKEND_URL = "https://pre-build-review-2.preview.emergentagent.com/api"

def test_root_endpoint():
    """Test GET /api/ endpoint - should return {"message": "Hello World"}"""
    print(f"\n=== Testing Root Endpoint ===")
    print(f"URL: {BACKEND_URL}/")
    
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"Response JSON: {data}")
                
                # Check if response matches expected format
                if data == {"message": "Hello World"}:
                    print("✅ Root endpoint test PASSED - Correct response format")
                    return True
                else:
                    print(f"❌ Root endpoint test FAILED - Expected {{'message': 'Hello World'}}, got {data}")
                    return False
                    
            except json.JSONDecodeError as e:
                print(f"❌ Root endpoint test FAILED - Invalid JSON response: {e}")
                print(f"Raw response: {response.text}")
                return False
        else:
            print(f"❌ Root endpoint test FAILED - Expected status 200, got {response.status_code}")
            print(f"Response text: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Root endpoint test FAILED - Request error: {e}")
        return False

def test_status_endpoints():
    """Test the status endpoints to verify backend functionality"""
    print(f"\n=== Testing Status Endpoints ===")
    
    # Test GET /api/status
    print(f"Testing GET {BACKEND_URL}/status")
    try:
        response = requests.get(f"{BACKEND_URL}/status", timeout=10)
        print(f"GET Status Code: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"✅ GET /status working - Response: {data}")
                get_status_working = True
            except json.JSONDecodeError:
                print(f"❌ GET /status - Invalid JSON response")
                get_status_working = False
        else:
            print(f"❌ GET /status failed with status {response.status_code}")
            get_status_working = False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ GET /status failed - Request error: {e}")
        get_status_working = False
    
    # Test POST /api/status
    print(f"\nTesting POST {BACKEND_URL}/status")
    test_data = {"client_name": "test_client_cricket_app"}
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/status", 
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        print(f"POST Status Code: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"✅ POST /status working - Response: {data}")
                post_status_working = True
            except json.JSONDecodeError:
                print(f"❌ POST /status - Invalid JSON response")
                post_status_working = False
        else:
            print(f"❌ POST /status failed with status {response.status_code}")
            print(f"Response: {response.text}")
            post_status_working = False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ POST /status failed - Request error: {e}")
        post_status_working = False
    
    return get_status_working and post_status_working

def main():
    """Run all backend tests"""
    print("=" * 60)
    print("CRICKAPP BACKEND API TESTING")
    print("=" * 60)
    print(f"Testing backend at: {BACKEND_URL}")
    print(f"Test started at: {datetime.now()}")
    
    # Test results
    results = {}
    
    # Test root endpoint (main requirement)
    results['root_endpoint'] = test_root_endpoint()
    
    # Test additional endpoints to verify backend health
    results['status_endpoints'] = test_status_endpoints()
    
    # Summary
    print(f"\n{'=' * 60}")
    print("TEST SUMMARY")
    print(f"{'=' * 60}")
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    overall_status = "✅ ALL TESTS PASSED" if all_passed else "❌ SOME TESTS FAILED"
    print(f"\nOverall Status: {overall_status}")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())