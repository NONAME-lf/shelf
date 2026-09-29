#include <cmath>
#include <iostream>

struct Point { double x, y; };

double distance(Point a, Point b) {
    return std::hypot(a.x - b.x, a.y - b.y);
}

int main() {
    std::cout << distance({0, 0}, {3, 4}) << '\n';  // 5
}
