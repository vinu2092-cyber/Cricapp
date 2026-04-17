#!/usr/bin/env python3
"""
CricApp Backend API Testing Suite
Tests all cricket API endpoints for functionality and data integrity
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, List, Optional

class CricAppBackendTester:
    def __init__(self, base_url: str = "http://localhost:8001"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results: List[Dict[str, Any]] = []

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_sample": str(response_data)[:200] if response_data else None
        })

    def test_endpoint(self, endpoint: str, expected_status: int = 200, test_name: str = None) -> Optional[Dict]:
        """Test a single endpoint"""
        if not test_name:
            test_name = f"GET {endpoint}"
        
        try:
            url = f"{self.base_url}{endpoint}"
            print(f"\n🔍 Testing {test_name}...")
            print(f"   URL: {url}")
            
            response = requests.get(url, timeout=30)
            
            if response.status_code != expected_status:
                self.log_test(test_name, False, f"Expected {expected_status}, got {response.status_code}")
                return None
            
            try:
                data = response.json()
                self.log_test(test_name, True, f"Status: {response.status_code}", data)
                return data
            except json.JSONDecodeError:
                self.log_test(test_name, False, "Invalid JSON response")
                return None
                
        except requests.exceptions.Timeout:
            self.log_test(test_name, False, "Request timeout (30s)")
            return None
        except requests.exceptions.ConnectionError:
            self.log_test(test_name, False, "Connection error")
            return None
        except Exception as e:
            self.log_test(test_name, False, f"Exception: {str(e)}")
            return None

    def validate_match_data(self, data: Dict, endpoint_name: str) -> bool:
        """Validate match data structure"""
        if not isinstance(data, dict):
            self.log_test(f"{endpoint_name} - Data Structure", False, "Response is not a dictionary")
            return False
        
        # Check for typeMatches structure (common in cricbuzz API)
        if 'typeMatches' in data:
            type_matches = data['typeMatches']
            if not isinstance(type_matches, list):
                self.log_test(f"{endpoint_name} - TypeMatches Structure", False, "typeMatches is not a list")
                return False
            
            self.log_test(f"{endpoint_name} - Data Structure", True, f"Found {len(type_matches)} match types")
            return True
        
        # Check for matchInfo structure (single match)
        elif 'matchInfo' in data:
            self.log_test(f"{endpoint_name} - Data Structure", True, "Single match data structure valid")
            return True
        
        # Check for commentary structure
        elif 'commentaryList' in data or 'miniscore' in data:
            self.log_test(f"{endpoint_name} - Data Structure", True, "Commentary/score data structure valid")
            return True
        
        # Check for events structure
        elif 'events' in data and 'currentScore' in data:
            self.log_test(f"{endpoint_name} - Data Structure", True, "Events data structure valid")
            return True
        
        else:
            # Generic validation - check if it has some data
            if len(data) > 0:
                self.log_test(f"{endpoint_name} - Data Structure", True, f"Generic data structure with {len(data)} keys")
                return True
            else:
                self.log_test(f"{endpoint_name} - Data Structure", False, "Empty response data")
                return False

    def test_basic_endpoints(self):
        """Test basic API endpoints"""
        print("\n" + "="*60)
        print("TESTING BASIC ENDPOINTS")
        print("="*60)
        
        # Test root endpoint
        self.test_endpoint("/api/", 200, "API Root")
        
        # Test health endpoint
        health_data = self.test_endpoint("/api/health", 200, "Health Check")
        if health_data:
            if 'status' in health_data and health_data['status'] == 'healthy':
                self.log_test("Health Status", True, "Backend is healthy")
            else:
                self.log_test("Health Status", False, "Backend reports unhealthy status")

    def test_cricket_endpoints(self):
        """Test cricket data endpoints"""
        print("\n" + "="*60)
        print("TESTING CRICKET DATA ENDPOINTS")
        print("="*60)
        
        # Test live matches
        live_data = self.test_endpoint("/api/cricket/matches/live", 200, "Live Matches")
        if live_data:
            self.validate_match_data(live_data, "Live Matches")
        
        # Test recent matches
        recent_data = self.test_endpoint("/api/cricket/matches/recent", 200, "Recent Matches")
        if recent_data:
            self.validate_match_data(recent_data, "Recent Matches")
        
        # Test upcoming matches
        upcoming_data = self.test_endpoint("/api/cricket/matches/upcoming", 200, "Upcoming Matches")
        if upcoming_data:
            self.validate_match_data(upcoming_data, "Upcoming Matches")
        
        return live_data, recent_data, upcoming_data

    def test_match_specific_endpoints(self, match_data_sources: tuple):
        """Test match-specific endpoints using real match IDs"""
        print("\n" + "="*60)
        print("TESTING MATCH-SPECIFIC ENDPOINTS")
        print("="*60)
        
        # Extract match IDs from the data sources
        match_ids = []
        
        for data_source in match_data_sources:
            if not data_source:
                continue
                
            if 'typeMatches' in data_source:
                for type_match in data_source['typeMatches']:
                    for series in type_match.get('seriesMatches', []):
                        series_wrapper = series.get('seriesAdWrapper', {})
                        for match in series_wrapper.get('matches', []):
                            match_info = match.get('matchInfo', {})
                            match_id = match_info.get('matchId')
                            if match_id:
                                match_ids.append(str(match_id))
                                if len(match_ids) >= 3:  # Limit to 3 matches for testing
                                    break
                        if len(match_ids) >= 3:
                            break
                    if len(match_ids) >= 3:
                        break
        
        if not match_ids:
            self.log_test("Match ID Extraction", False, "No match IDs found in data sources")
            # Use a fallback test match ID
            match_ids = ["12345"]  # This will likely fail but tests the endpoint structure
        else:
            self.log_test("Match ID Extraction", True, f"Found {len(match_ids)} match IDs: {match_ids[:3]}")
        
        # Test match detail endpoint
        for i, match_id in enumerate(match_ids[:2]):  # Test first 2 matches
            detail_data = self.test_endpoint(f"/api/cricket/match/{match_id}", 200, f"Match Detail #{i+1} (ID: {match_id})")
            if detail_data:
                self.validate_match_data(detail_data, f"Match Detail #{i+1}")
            
            # Test commentary endpoint
            comm_data = self.test_endpoint(f"/api/cricket/match/{match_id}/commentary", 200, f"Match Commentary #{i+1} (ID: {match_id})")
            if comm_data:
                self.validate_match_data(comm_data, f"Match Commentary #{i+1}")
            
            # Test events endpoint
            events_data = self.test_endpoint(f"/api/cricket/match/{match_id}/events", 200, f"Match Events #{i+1} (ID: {match_id})")
            if events_data:
                self.validate_match_data(events_data, f"Match Events #{i+1}")

    def test_api_key_rotation(self):
        """Test API key rotation by making multiple requests"""
        print("\n" + "="*60)
        print("TESTING API KEY ROTATION")
        print("="*60)
        
        # Make multiple requests to trigger key rotation
        for i in range(3):
            health_data = self.test_endpoint("/api/health", 200, f"Key Rotation Test #{i+1}")
            if health_data and 'current_key_index' in health_data:
                print(f"   Current key index: {health_data['current_key_index']}")
            time.sleep(1)  # Small delay between requests

    def test_fcm_endpoints(self):
        """Test FCM (Firebase Cloud Messaging) endpoints"""
        print("\n" + "="*60)
        print("TESTING FCM ENDPOINTS")
        print("="*60)
        
        # Test FCM Subscribe endpoint
        test_token = "test_fcm_token_12345"
        subscribe_payload = {
            "token": test_token,
            "topic": "all_users"
        }
        
        try:
            url = f"{self.base_url}/api/fcm/subscribe"
            print(f"\n🔍 Testing FCM Subscribe...")
            print(f"   URL: {url}")
            print(f"   Payload: {subscribe_payload}")
            
            response = requests.post(url, json=subscribe_payload, timeout=30)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if 'status' in data:
                        self.log_test("FCM Subscribe", True, f"Status: {data.get('status')}, Topic: {data.get('topic', 'N/A')}", data)
                    else:
                        self.log_test("FCM Subscribe", False, "Missing status in response")
                except json.JSONDecodeError:
                    self.log_test("FCM Subscribe", False, "Invalid JSON response")
            else:
                self.log_test("FCM Subscribe", False, f"Expected 200, got {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.log_test("FCM Subscribe", False, "Request timeout (30s)")
        except requests.exceptions.ConnectionError:
            self.log_test("FCM Subscribe", False, "Connection error")
        except Exception as e:
            self.log_test("FCM Subscribe", False, f"Exception: {str(e)}")
        
        # Test FCM Broadcast endpoint
        broadcast_params = {
            "title": "Test Broadcast",
            "body": "This is a test admin broadcast message",
            "topic": "all_users"
        }
        
        try:
            url = f"{self.base_url}/api/fcm/broadcast"
            print(f"\n🔍 Testing FCM Broadcast...")
            print(f"   URL: {url}")
            print(f"   Params: {broadcast_params}")
            
            response = requests.post(url, params=broadcast_params, timeout=30)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if 'status' in data:
                        self.log_test("FCM Broadcast", True, f"Status: {data.get('status')}, Message ID: {data.get('message_id', 'N/A')}", data)
                    else:
                        self.log_test("FCM Broadcast", False, "Missing status in response")
                except json.JSONDecodeError:
                    self.log_test("FCM Broadcast", False, "Invalid JSON response")
            else:
                self.log_test("FCM Broadcast", False, f"Expected 200, got {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.log_test("FCM Broadcast", False, "Request timeout (30s)")
        except requests.exceptions.ConnectionError:
            self.log_test("FCM Broadcast", False, "Connection error")
        except Exception as e:
            self.log_test("FCM Broadcast", False, f"Exception: {str(e)}")

    def test_caching_system(self):
        """Test the caching system"""
        print("\n" + "="*60)
        print("TESTING CACHING SYSTEM")
        print("="*60)
        
        # First request (should cache)
        start_time = time.time()
        self.test_endpoint("/api/cricket/matches/live", 200, "Cache Test - First Request")
        first_request_time = time.time() - start_time
        
        # Second request (should use cache)
        start_time = time.time()
        self.test_endpoint("/api/cricket/matches/live", 200, "Cache Test - Second Request")
        second_request_time = time.time() - start_time
        
        # Check if second request was faster (indicating cache usage)
        if second_request_time < first_request_time * 0.8:  # 20% faster threshold
            self.log_test("Cache Performance", True, f"Second request faster: {second_request_time:.2f}s vs {first_request_time:.2f}s")
        else:
            self.log_test("Cache Performance", False, f"No significant speed improvement: {second_request_time:.2f}s vs {first_request_time:.2f}s")

    def run_all_tests(self):
        """Run all tests"""
        print("🏏 CricApp Backend API Testing Suite")
        print("="*60)
        print(f"Testing backend at: {self.base_url}")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Run test suites
        self.test_basic_endpoints()
        self.test_fcm_endpoints()  # Test FCM functionality first
        match_data = self.test_cricket_endpoints()
        self.test_match_specific_endpoints(match_data)
        self.test_api_key_rotation()
        self.test_caching_system()
        
        # Print summary
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Print failed tests
        failed_tests = [t for t in self.test_results if not t['success']]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"   • {test['test']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = CricAppBackendTester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n💥 Test suite crashed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())