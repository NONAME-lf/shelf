#include <array>
#include <iostream>

using Matrix = std::array<std::array<int, 2>, 2>;

Matrix multiply(const Matrix& a, const Matrix& b) {
    Matrix c{};
    for (int i = 0; i < 2; ++i)
        for (int j = 0; j < 2; ++j)
            for (int k = 0; k < 2; ++k) c[i][j] += a[i][k] * b[k][j];
    return c;
}

int main() {
    Matrix fib{{{1, 1}, {1, 0}}};
    Matrix r = multiply(fib, fib);
    std::cout << r[0][0] << ' ' << r[0][1] << '\n';
}
