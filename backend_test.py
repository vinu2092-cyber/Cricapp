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
BACKEND_URL = "https://dragable-ui-test.preview.emergentagent.com/api"

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

def test_cricket_matches_endpoints():
    """Test cricket matches endpoints"""
    print(f"\n=== Testing Cricket Matches Endpoints ===")
    
    endpoints = [
        ("live", "/cricket/matches/live"),
        ("recent", "/cricket/matches/recent"), 
        ("upcoming", "/cricket/matches/upcoming")
    ]
    
    results = {}
    
    for endpoint_name, endpoint_path in endpoints:
        print(f"\nTesting {endpoint_name} matches: {BACKEND_URL}{endpoint_path}")
        
        try:
            response = requests.get(f"{BACKEND_URL}{endpoint_path}", timeout=15)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    
                    # Check if response has expected structure
                    if isinstance(data, dict) and 'typeMatches' in data:
                        print(f"✅ {endpoint_name} matches endpoint working - Has typeMatches structure")
                        print(f"   Found {len(data.get('typeMatches', []))} match types")
                        
                        # Count total matches
                        total_matches = 0
                        for type_match in data.get('typeMatches', []):
                            for series_match in type_match.get('seriesMatches', []):
                                if 'seriesAdWrapper' in series_match and 'matches' in series_match['seriesAdWrapper']:
                                    total_matches += len(series_match['seriesAdWrapper']['matches'])
                        
                        print(f"   Total matches found: {total_matches}")
                        results[endpoint_name] = True
                        
                    else:
                        print(f"❌ {endpoint_name} matches endpoint - Invalid response structure")
                        print(f"   Expected 'typeMatches' field, got: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                        results[endpoint_name] = False
                        
                except json.JSONDecodeError as e:
                    print(f"❌ {endpoint_name} matches endpoint - Invalid JSON: {e}")
                    results[endpoint_name] = False
                    
            elif response.status_code == 500:
                print(f"⚠️  {endpoint_name} matches endpoint - Server error (API key rotation may be needed)")
                print(f"   Response: {response.text[:200]}...")
                results[endpoint_name] = False
                
            else:
                print(f"❌ {endpoint_name} matches endpoint - Status {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                results[endpoint_name] = False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ {endpoint_name} matches endpoint - Request error: {e}")
            results[endpoint_name] = False
    
    return results

def test_cricket_commentary_endpoint():
    """Test cricket commentary endpoint with a real match ID from live matches"""
    print(f"\n=== Testing Cricket Commentary Endpoint ===")
    
    # First get a real match ID from live matches
    try:
        response = requests.get(f"{BACKEND_URL}/cricket/matches/live", timeout=10)
        if response.status_code == 200:
            data = response.json()
            real_match_id = None
            
            # Extract first available match ID
            for type_match in data.get('typeMatches', []):
                for series_match in type_match.get('seriesMatches', []):
                    if 'seriesAdWrapper' in series_match and 'matches' in series_match['seriesAdWrapper']:
                        for match in series_match['seriesAdWrapper']['matches']:
                            if 'matchInfo' in match and 'matchId' in match['matchInfo']:
                                real_match_id = str(match['matchInfo']['matchId'])
                                break
                    if real_match_id:
                        break
                if real_match_id:
                    break
            
            if real_match_id:
                print(f"Testing commentary for real match ID: {real_match_id}")
                endpoint = f"/cricket/match/{real_match_id}/commentary"
                
                try:
                    response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=15)
                    print(f"Status Code: {response.status_code}")
                    
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            
                            # Check if response has expected commentary structure
                            if isinstance(data, dict) and 'comwrapper' in data:
                                print(f"✅ Commentary endpoint working for match {real_match_id}")
                                print(f"   Found {len(data.get('comwrapper', []))} commentary items")
                                
                                # Check if we have actual commentary data
                                if data.get('comwrapper') and len(data['comwrapper']) > 0:
                                    first_comm = data['comwrapper'][0]
                                    if 'commentary' in first_comm and 'commtxt' in first_comm['commentary']:
                                        print(f"   Sample commentary: {first_comm['commentary']['commtxt'][:50]}...")
                                
                                return True
                                
                            else:
                                print(f"❌ Commentary endpoint - Unexpected structure for match {real_match_id}")
                                print(f"   Response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                                return False
                                
                        except json.JSONDecodeError as e:
                            print(f"❌ Commentary endpoint - Invalid JSON for match {real_match_id}: {e}")
                            return False
                            
                    elif response.status_code == 500:
                        print(f"❌ Commentary endpoint - Server error for match {real_match_id}")
                        print(f"   Response: {response.text[:200]}...")
                        return False
                        
                    else:
                        print(f"❌ Commentary endpoint - Status {response.status_code} for match {real_match_id}")
                        return False
                        
                except requests.exceptions.RequestException as e:
                    print(f"❌ Commentary endpoint - Request error for match {real_match_id}: {e}")
                    return False
            else:
                print(f"❌ Could not find any match ID from live matches to test commentary")
                return False
        else:
            print(f"❌ Could not fetch live matches to get real match ID")
            return False
            
    except Exception as e:
        print(f"❌ Error getting real match ID: {e}")
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
    
    # Test cricket-specific endpoints
    cricket_results = test_cricket_matches_endpoints()
    results.update(cricket_results)
    
    # Test commentary endpoint
    results['commentary_endpoint'] = test_cricket_commentary_endpoint()
    
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
    
    # Additional info about API key rotation
    if not all_passed:
        print(f"\n📝 NOTE: If cricket endpoints are failing with 500 errors,")
        print(f"   this may indicate API key rotation is needed or RapidAPI limits reached.")
        print(f"   The backend implements automatic key rotation for 429 errors.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())