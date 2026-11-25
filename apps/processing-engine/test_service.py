"""
Unit tests for the Video Processing Service
Run with: pytest test_service.py
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import numpy as np

from main import app
from analyzer import VideoAnalyzer, KalmanSmoother
from renderer import VideoRenderer


# Test Client
client = TestClient(app)


class TestAPI:
    """Test API endpoints"""
    
    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 404
    
    def test_health_check(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_analyze_video_missing_file(self):
        """Test analyze endpoint with missing file"""
        response = client.post(
            "/analyze-video",
            json={"video_path": "/nonexistent/video.mp4"}
        )
        assert response.status_code == 404


class TestVideoAnalyzer:
    """Test VideoAnalyzer class"""
    
    def test_analyzer_initialization(self):
        """Test analyzer initializes correctly"""
        analyzer = VideoAnalyzer(sample_rate=5)
        assert analyzer.sample_rate == 5
        assert analyzer.face_detection is not None
    
    def test_smooth_positions(self):
        """Test position smoothing"""
        analyzer = VideoAnalyzer()
        
        # Create test data with noise
        positions = [100, 105, 98, 102, 101, 103, 99, 100]
        smoothed = analyzer._smooth_positions(positions, window_size=3)
        
        assert len(smoothed) == len(positions)
        assert isinstance(smoothed, list)
        
        # Smoothed values should be close to original
        assert 95 < smoothed[4] < 110
    
    def test_detect_face_center_no_face(self):
        """Test face detection with no face"""
        analyzer = VideoAnalyzer()
        
        # Create blank frame
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        width, height = 1920, 1080
        
        center_x = analyzer._detect_face_center(frame, width, height)
        
        # Should return center of frame when no face detected
        assert center_x == width / 2
    
    def test_generate_crop_data(self):
        """Test crop data generation"""
        analyzer = VideoAnalyzer()
        
        smoothed_centers = [960, 960, 960]
        frame_numbers = [0, 5, 10]
        total_frames = 15
        width, height = 1920, 1080
        crop_width, crop_height = 607, 1080
        
        crop_data = analyzer._generate_crop_data(
            smoothed_centers,
            frame_numbers,
            total_frames,
            width,
            height,
            crop_width,
            crop_height
        )
        
        assert len(crop_data) == total_frames
        assert crop_data[0]["width"] == crop_width
        assert crop_data[0]["height"] == crop_height
        assert 0 <= crop_data[0]["x"] <= width - crop_width


class TestKalmanSmoother:
    """Test Kalman Filter smoothing"""
    
    def test_kalman_initialization(self):
        """Test Kalman filter initializes"""
        kalman = KalmanSmoother()
        assert kalman.estimate is None
        assert kalman.error == 1.0
    
    def test_kalman_update(self):
        """Test Kalman filter update"""
        kalman = KalmanSmoother()
        
        result1 = kalman.update(100)
        assert result1 == 100  # First update returns measurement
        
        result2 = kalman.update(105)
        assert 100 < result2 < 105  # Filtered value between measurements
    
    def test_kalman_smooth_sequence(self):
        """Test Kalman smoothing on sequence"""
        kalman = KalmanSmoother()
        
        positions = [100, 105, 98, 102, 101]
        smoothed = kalman.smooth(positions)
        
        assert len(smoothed) == len(positions)
        assert isinstance(smoothed, list)


class TestVideoRenderer:
    """Test VideoRenderer class"""
    
    @patch('subprocess.run')
    def test_renderer_check_ffmpeg(self, mock_run):
        """Test FFmpeg check"""
        mock_run.return_value = Mock(returncode=0)
        renderer = VideoRenderer()
        assert renderer is not None
    
    def test_render_empty_crop_data(self):
        """Test render with empty crop data"""
        renderer = VideoRenderer()
        
        with pytest.raises(ValueError, match="Crop data is empty"):
            renderer.render("input.mp4", [], "output.mp4")


class TestIntegration:
    """Integration tests"""
    
    def test_crop_dimension_calculation(self):
        """Test 16:9 to 9:16 conversion"""
        # Input: 1920x1080 (16:9)
        width, height = 1920, 1080
        
        # Calculate crop dimensions for 9:16
        crop_width = int(height * 9 / 16)
        crop_height = height
        
        assert crop_width == 607
        assert crop_height == 1080
        
        # Verify aspect ratio
        aspect_ratio = crop_width / crop_height
        expected_ratio = 9 / 16
        assert abs(aspect_ratio - expected_ratio) < 0.01


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
