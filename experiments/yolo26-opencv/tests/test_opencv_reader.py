import unittest
import cv2
import numpy as np

from opencv_reader import count_half_pips, read_rectified_tile


class OpenCVReaderTests(unittest.TestCase):
    def make_half(self, count: int) -> np.ndarray:
        image = np.full((320, 316, 3), 242, dtype=np.uint8)
        positions = [
            (48, 48), (158, 48), (268, 48),
            (48, 160), (158, 160), (268, 160),
            (48, 272), (158, 272), (268, 272),
            (103, 104), (213, 216), (103, 216),
        ][:count]
        for x, y in positions:
            cv2.circle(image, (x, y), 22, (0, 145, 245), -1)
            cv2.circle(image, (x - 5, y - 6), 5, (180, 210, 255), -1)
        return image

    def test_component_and_hough_fusion_counts_ten_glossy_orange_pips(self):
        count, centres = count_half_pips(self.make_half(10))
        self.assertEqual(count, 10, f"centres={centres}")

    def test_rectified_split_preserves_left_right_physical_order(self):
        image = np.full((320, 640, 3), 242, dtype=np.uint8)
        cv2.rectangle(image, (1, 1), (638, 318), (242, 242, 242), -1)
        cv2.rectangle(image, (312, 12), (328, 308), (15, 15, 15), -1)
        image[:, :312] = self.make_half(7)[:, :312]
        image[:, 328:] = self.make_half(11)[:, 4:]
        result = read_rectified_tile(image)
        self.assertEqual((result.side_a, result.side_b), (7, 11))


if __name__ == "__main__":
    unittest.main()
