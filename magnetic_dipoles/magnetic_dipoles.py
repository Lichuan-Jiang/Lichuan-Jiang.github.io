"""Interactive magnetic dipole field simulator.

Dependencies:
    pip install numpy matplotlib

Run:
    python magnetic_dipoles.py

Drag a dipole center to move it. Drag its arrow tip to rotate it. Use the
sliders to edit the same formula parameters exposed in the static website.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, pi, sin

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle, FancyArrowPatch
from matplotlib.widgets import Button, CheckButtons, Slider


@dataclass
class Dipole:
    x: float
    y: float
    moment: float
    theta: float

    @property
    def vector(self) -> tuple[float, float]:
        return self.moment * cos(self.theta), self.moment * sin(self.theta)


class DipoleSimulator:
    def __init__(self) -> None:
        self.bounds = (-4.0, 4.0, -2.6, 2.6)
        self.dipoles = [
            Dipole(-1.45, 0.0, 1.7, 0.0),
            Dipole(1.45, 0.0, 1.7, pi),
        ]
        self.selected = 0
        self.drag_mode: str | None = None

        self.fig, self.ax = plt.subplots(figsize=(12, 7))
        self.fig.subplots_adjust(left=0.07, right=0.74, bottom=0.27, top=0.88)
        self.ax.set_aspect("equal", adjustable="box")
        self.ax.set_xlim(self.bounds[0], self.bounds[1])
        self.ax.set_ylim(self.bounds[2], self.bounds[3])
        self.ax.set_xlabel("x")
        self.ax.set_ylabel("y")
        self.ax.set_title("Magnetic dipole field simulator")
        self.ax.grid(True, alpha=0.25)

        formula = (
            r"$B(r)=C\sum_i[\alpha r_i(m_i\cdot r_i)/\rho_i^{n+2}"
            r"-m_i/\rho_i^n],\quad \rho_i=\sqrt{|r_i|^2+a^2}$"
            "\nPhysical point dipoles: alpha = 3, n = 3. Softening a prevents the singularity."
        )
        self.fig.text(0.07, 0.94, formula, ha="left", va="top", fontsize=10)

        self.quiver = None
        self.stream = None
        self.center_marks: list[Circle] = []
        self.arrows: list[FancyArrowPatch] = []
        self._build_widgets()
        self._connect_events()
        self.redraw()

    def _build_widgets(self) -> None:
        self.slider_c = Slider(self.fig.add_axes((0.08, 0.18, 0.26, 0.025)), "C", 0.1, 3.0, valinit=1.0)
        self.slider_a = Slider(self.fig.add_axes((0.08, 0.14, 0.26, 0.025)), "a", 0.02, 0.7, valinit=0.16)
        self.slider_alpha = Slider(self.fig.add_axes((0.08, 0.10, 0.26, 0.025)), "alpha", 0.0, 6.0, valinit=3.0)
        self.slider_n = Slider(self.fig.add_axes((0.08, 0.06, 0.26, 0.025)), "n", 1.0, 5.0, valinit=3.0)
        self.slider_m = Slider(self.fig.add_axes((0.45, 0.18, 0.22, 0.025)), "moment", 0.2, 3.0, valinit=1.7)
        self.slider_theta = Slider(self.fig.add_axes((0.45, 0.14, 0.22, 0.025)), "angle deg", -180, 180, valinit=0)

        self.check = CheckButtons(
            self.fig.add_axes((0.78, 0.72, 0.16, 0.10)),
            ["vectors", "streamlines"],
            [True, True],
        )
        self.add_button = Button(self.fig.add_axes((0.78, 0.60, 0.16, 0.05)), "Add dipole")
        self.remove_button = Button(self.fig.add_axes((0.78, 0.53, 0.16, 0.05)), "Remove selected")
        self.reset_button = Button(self.fig.add_axes((0.78, 0.46, 0.16, 0.05)), "Reset")

        for slider in [self.slider_c, self.slider_a, self.slider_alpha, self.slider_n]:
            slider.on_changed(lambda _value: self.redraw())
        self.slider_m.on_changed(self._moment_changed)
        self.slider_theta.on_changed(self._theta_changed)
        self.check.on_clicked(lambda _label: self.redraw())
        self.add_button.on_clicked(self._add_dipole)
        self.remove_button.on_clicked(self._remove_dipole)
        self.reset_button.on_clicked(self._reset)

    def _connect_events(self) -> None:
        self.fig.canvas.mpl_connect("button_press_event", self._on_press)
        self.fig.canvas.mpl_connect("motion_notify_event", self._on_motion)
        self.fig.canvas.mpl_connect("button_release_event", self._on_release)

    def field(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        c = self.slider_c.val
        a = self.slider_a.val
        alpha = self.slider_alpha.val
        n = self.slider_n.val
        bx = np.zeros_like(x, dtype=float)
        by = np.zeros_like(y, dtype=float)

        for dipole in self.dipoles:
            rx = x - dipole.x
            ry = y - dipole.y
            mx, my = dipole.vector
            dot = mx * rx + my * ry
            rho2 = rx * rx + ry * ry + a * a
            bx += c * (alpha * rx * dot / rho2 ** ((n + 2.0) / 2.0) - mx / rho2 ** (n / 2.0))
            by += c * (alpha * ry * dot / rho2 ** ((n + 2.0) / 2.0) - my / rho2 ** (n / 2.0))
        return bx, by

    def redraw(self) -> None:
        for artist in [self.quiver, self.stream]:
            if artist is not None:
                if hasattr(artist, "lines"):
                    artist.lines.remove()
                    artist.arrows.remove()
                else:
                    artist.remove()
        for artist in [*self.center_marks, *self.arrows]:
            artist.remove()

        self.center_marks.clear()
        self.arrows.clear()

        x_min, x_max, y_min, y_max = self.bounds
        x = np.linspace(x_min, x_max, 31)
        y = np.linspace(y_min, y_max, 21)
        xx, yy = np.meshgrid(x, y)
        bx, by = self.field(xx, yy)
        magnitude = np.hypot(bx, by)
        ux = np.divide(bx, magnitude, out=np.zeros_like(bx), where=magnitude > 1e-9)
        uy = np.divide(by, magnitude, out=np.zeros_like(by), where=magnitude > 1e-9)

        show_vectors, show_streamlines = self.check.get_status()
        if show_vectors:
            self.quiver = self.ax.quiver(xx, yy, ux, uy, magnitude, cmap="viridis", pivot="middle", alpha=0.75)
        else:
            self.quiver = None

        if show_streamlines:
            sx = np.linspace(x_min, x_max, 160)
            sy = np.linspace(y_min, y_max, 104)
            sxx, syy = np.meshgrid(sx, sy)
            sbx, sby = self.field(sxx, syy)
            self.stream = self.ax.streamplot(sx, sy, sbx, sby, color="0.35", density=1.2, linewidth=0.8, arrowsize=0.8)
        else:
            self.stream = None

        for idx, dipole in enumerate(self.dipoles):
            color = "tab:red" if idx == self.selected else "tab:blue"
            center = Circle((dipole.x, dipole.y), 0.09 if idx != self.selected else 0.13, color=color, zorder=5)
            self.ax.add_patch(center)
            self.center_marks.append(center)

            length = 0.42 + 0.18 * dipole.moment
            dx = length * cos(dipole.theta)
            dy = length * sin(dipole.theta)
            arrow = FancyArrowPatch(
                (dipole.x - dx, dipole.y - dy),
                (dipole.x + dx, dipole.y + dy),
                arrowstyle="-|>",
                mutation_scale=16,
                linewidth=3,
                color=color,
                zorder=6,
            )
            self.ax.add_patch(arrow)
            self.arrows.append(arrow)

        self._sync_selected_widgets()
        self.fig.canvas.draw_idle()

    def _sync_selected_widgets(self) -> None:
        dipole = self.dipoles[self.selected]
        self.slider_m.eventson = False
        self.slider_theta.eventson = False
        self.slider_m.set_val(dipole.moment)
        self.slider_theta.set_val(self._theta_degrees(dipole.theta))
        self.slider_m.eventson = True
        self.slider_theta.eventson = True

    def _on_press(self, event) -> None:
        if event.inaxes != self.ax or event.xdata is None or event.ydata is None:
            return
        hit = self._hit_test(event.xdata, event.ydata)
        if hit is None:
            return
        self.selected, self.drag_mode = hit
        self.redraw()

    def _on_motion(self, event) -> None:
        if self.drag_mode is None or event.inaxes != self.ax or event.xdata is None or event.ydata is None:
            return
        dipole = self.dipoles[self.selected]
        if self.drag_mode == "move":
            dipole.x = float(np.clip(event.xdata, self.bounds[0] + 0.15, self.bounds[1] - 0.15))
            dipole.y = float(np.clip(event.ydata, self.bounds[2] + 0.15, self.bounds[3] - 0.15))
        else:
            dipole.theta = atan2(event.ydata - dipole.y, event.xdata - dipole.x)
        self.redraw()

    def _on_release(self, _event) -> None:
        self.drag_mode = None

    def _hit_test(self, x: float, y: float) -> tuple[int, str] | None:
        for idx in range(len(self.dipoles) - 1, -1, -1):
            dipole = self.dipoles[idx]
            if np.hypot(x - dipole.x, y - dipole.y) < 0.28:
                return idx, "move"

            length = 0.42 + 0.18 * dipole.moment
            head_x = dipole.x + length * cos(dipole.theta)
            head_y = dipole.y + length * sin(dipole.theta)
            if np.hypot(x - head_x, y - head_y) < 0.28:
                return idx, "rotate"
        return None

    def _moment_changed(self, value: float) -> None:
        self.dipoles[self.selected].moment = value
        self.redraw()

    def _theta_changed(self, value: float) -> None:
        self.dipoles[self.selected].theta = value * pi / 180.0
        self.redraw()

    def _add_dipole(self, _event) -> None:
        offset = 0.25 * len(self.dipoles)
        self.dipoles.append(Dipole(-0.6 + offset, 0.6, 1.2, pi / 2.0))
        self.selected = len(self.dipoles) - 1
        self.redraw()

    def _remove_dipole(self, _event) -> None:
        if len(self.dipoles) <= 1:
            return
        self.dipoles.pop(self.selected)
        self.selected = max(0, self.selected - 1)
        self.redraw()

    def _reset(self, _event) -> None:
        self.dipoles = [
            Dipole(-1.45, 0.0, 1.7, 0.0),
            Dipole(1.45, 0.0, 1.7, pi),
        ]
        self.selected = 0
        self.slider_c.set_val(1.0)
        self.slider_a.set_val(0.16)
        self.slider_alpha.set_val(3.0)
        self.slider_n.set_val(3.0)
        self.redraw()

    @staticmethod
    def _theta_degrees(theta: float) -> float:
        degrees = theta * 180.0 / pi
        while degrees > 180:
            degrees -= 360
        while degrees < -180:
            degrees += 360
        return degrees


if __name__ == "__main__":
    DipoleSimulator()
    plt.show()
