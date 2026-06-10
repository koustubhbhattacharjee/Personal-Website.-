export const AP_PHYSICS_1_TAXONOMY = {
  "ap physics 1": {
    "standards": [
      {
        "code": "APPhy1.1",
        "name": "Unit 1: Kinematics",
        "objectives": [
          {
            "code": "APPhy1.1.1",
            "name": "Scalars and Vectors in One Dimension",
            "legacy_codes": [
              "1.1.A",
              "1.1.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.1.1.1",
                "text": "Scalars are quantities described by magnitude only; vectors are quantities described by both magnitude and direction.",
                "raw_code": "1.1.A.1",
                "legacy_ids": [
                  "1.1.A.1"
                ]
              },
              {
                "id": "APPhy1.1.1.2",
                "text": "Vectors can be visually modeled as arrows with appropriate direction and lengths proportional to their magnitude.",
                "raw_code": "1.1.A.2",
                "legacy_ids": [
                  "1.1.A.2"
                ]
              },
              {
                "id": "APPhy1.1.1.3",
                "text": "Distance and speed are examples of scalar quantities, while position, displacement, velocity, and acceleration are examples of vector quantities. Vectors are notated with an arrow above the symbol for that quantity. Relevant equation: $$\\\\vec{v} = \\\\vec{v}_0 + \\\\vec{a}t$$ Vector notation is not required for vector components along an axis. In one dimension, the sign of the component completely describes the direction of that component. Derived equation: $$v_x = v_{x0} + a_x t$$",
                "raw_code": "1.1.A.3",
                "legacy_ids": [
                  "1.1.A.3",
                  "1.1.A.3.i",
                  "1.1.A.3.ii"
                ]
              },
              {
                "id": "APPhy1.1.1.4",
                "text": "When determining a vector sum in a given one-dimensional coordinate system, opposite directions are denoted by opposite signs.",
                "raw_code": "1.1.B.1",
                "legacy_ids": [
                  "1.1.B.1"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.1.2",
            "name": "Displacement, Velocity, and Acceleration",
            "legacy_codes": [
              "1.2.A",
              "1.2.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.1.2.1",
                "text": "When using the object model, the size, shape, and internal configuration are ignored. The object may be treated as a single point with extensive properties such as mass and charge.",
                "raw_code": "1.2.A.1",
                "legacy_ids": [
                  "1.2.A.1"
                ]
              },
              {
                "id": "APPhy1.1.2.2",
                "text": "Displacement is the change in an object's position. Relevant equation: $$\\\\Delta x = x - x_0$$",
                "raw_code": "1.2.A.2",
                "legacy_ids": [
                  "1.2.A.2"
                ]
              },
              {
                "id": "APPhy1.1.2.3",
                "text": "Averages of velocity and acceleration are calculated considering the initial and final states of an object over an interval of time.",
                "raw_code": "1.2.B.1",
                "legacy_ids": [
                  "1.2.B.1"
                ]
              },
              {
                "id": "APPhy1.1.2.4",
                "text": "Average velocity is the displacement of an object divided by the interval of time in which that displacement occurs. Relevant equation: $$\\\\vec{v}_{\\\\text{avg}} = \\\\frac{\\\\Delta \\\\vec{x}}{\\\\Delta t}$$",
                "raw_code": "1.2.B.2",
                "legacy_ids": [
                  "1.2.B.2"
                ]
              },
              {
                "id": "APPhy1.1.2.5",
                "text": "Average acceleration is the change in velocity divided by the interval of time in which that change in velocity occurs. Relevant equation: $$\\\\vec{a}_{\\\\rm avg} = \\\\frac{\\\\Delta \\\\vec{v}}{\\\\Delta t}$$",
                "raw_code": "1.2.B.3",
                "legacy_ids": [
                  "1.2.B.3"
                ]
              },
              {
                "id": "APPhy1.1.2.6",
                "text": "An object is accelerating if either the magnitude and/or direction of the object's velocity are changing.",
                "raw_code": "1.2.B.4",
                "legacy_ids": [
                  "1.2.B.4"
                ]
              },
              {
                "id": "APPhy1.1.2.7",
                "text": "Calculating average velocity or average acceleration over a very small time interval yields a value that is very close to the instantaneous velocity or instantaneous acceleration.",
                "raw_code": "1.2.B.5",
                "legacy_ids": [
                  "1.2.B.5"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.1.3",
            "name": "Representing Motion",
            "legacy_codes": [
              "1.3.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.1.3.1",
                "text": "Motion can be represented by motion diagrams, figures, graphs, equations, and narrative descriptions.",
                "raw_code": "1.3.A.1",
                "legacy_ids": [
                  "1.3.A.1"
                ]
              },
              {
                "id": "APPhy1.1.3.2",
                "text": "For constant acceleration, three kinematic equations can be used to describe instantaneous linear motion in one dimension: $$v_{x} = v_{x0} + a_{x}t$$ $$x = x_{0} + v_{x0}t + \\\\frac{1}{2}a_{x}t^{2}$$ $$v_{x}^{2} = v_{x0}^{2} + 2a_{x}(x - x_{0})$$ Note: The equations above are written to indicate motion in the x-direction, but these equations can be used in any single dimension as appropriate.",
                "raw_code": "1.3.A.2",
                "legacy_ids": [
                  "1.3.A.2"
                ]
              },
              {
                "id": "APPhy1.1.3.3",
                "text": "Near the surface of Earth, the vertical acceleration caused by the force of gravity is downward, constant, and has a measured value approximately equal to $$a_g = g \\\\approx 10 \\\\text{ m/s}^2$$ .",
                "raw_code": "1.3.A.3",
                "legacy_ids": [
                  "1.3.A.3"
                ]
              },
              {
                "id": "APPhy1.1.3.4",
                "text": "Graphs of position, velocity, and acceleration as functions of time can be used to find the relationships between those quantities. An object's instantaneous velocity is the rate of change of the object's position, which is equal to the slope of a line tangent to a point on a graph of the object's position as a function of time. An object's instantaneous acceleration is the rate of change of the object's velocity, which is equal to the slope of a line tangent to a point on a graph of the object's velocity as a function of time. The displacement of an object during a time interval is equal to the area under the curve of a graph of the object's velocity as a function of time (i.e., the area bounded by the function and the horizontal axis for the appropriate interval). The change in velocity of an object during a time interval is equal to the area under the curve of a graph of the acceleration of the object as a function of time.",
                "raw_code": "1.3.A.4",
                "legacy_ids": [
                  "1.3.A.4",
                  "1.3.A.4.i",
                  "1.3.A.4.ii",
                  "1.3.A.4.iii",
                  "1.3.A.4.iv"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.1.4",
            "name": "Reference Frames and Relative Motion",
            "legacy_codes": [
              "1.4.A",
              "1.4.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.1.4.1",
                "text": "The choice of reference frame will determine the direction and magnitude of quantities measured by an observer in that reference frame.",
                "raw_code": "1.4.A.1",
                "legacy_ids": [
                  "1.4.A.1"
                ]
              },
              {
                "id": "APPhy1.1.4.2",
                "text": "Measurements from a given reference frame may be converted to measurements from another reference frame.",
                "raw_code": "1.4.B.1",
                "legacy_ids": [
                  "1.4.B.1"
                ]
              },
              {
                "id": "APPhy1.1.4.3",
                "text": "The observed velocity of an object results from the combination of the object's velocity and the velocity of the observer's reference frame. Combining the motion of an object and the motion of an observer in a given reference frame involves the addition or subtraction of vectors The acceleration of any object is the same as measured from all inertial reference frames",
                "raw_code": "1.4.B.2",
                "legacy_ids": [
                  "1.4.B.2",
                  "1.4.B.2.i",
                  "1.4.B.2.ii"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.1.5",
            "name": "Vectors and Motion in Two Dimensions",
            "legacy_codes": [
              "1.5.A",
              "1.5.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.1.5.1",
                "text": "Vectors can be mathematically modeled as the resultant of two perpendicular components.",
                "raw_code": "1.5.A.1",
                "legacy_ids": [
                  "1.5.A.1"
                ]
              },
              {
                "id": "APPhy1.1.5.2",
                "text": "Vectors can be resolved into components using a chosen coordinate system.",
                "raw_code": "1.5.A.2",
                "legacy_ids": [
                  "1.5.A.2"
                ]
              },
              {
                "id": "APPhy1.1.5.3",
                "text": "Vectors can be resolved into perpendicular components using trigonometric functions and relationships. Relevant equations: $$\\sin\\theta = \\frac{a}{c}$$ $$\\cos \\theta = \\frac{b}{c}$$ $$\\tan \\theta = \\frac{a}{b}$$ $$a^2 + b^2 = c^2$$",
                "raw_code": "1.5.A.3",
                "legacy_ids": [
                  "1.5.A.3"
                ]
              },
              {
                "id": "APPhy1.1.5.4",
                "text": "Motion in two dimensions can be analyzed using one-dimensional kinematic relationships if the motion is separated into components.",
                "raw_code": "1.5.B.1",
                "legacy_ids": [
                  "1.5.B.1"
                ]
              },
              {
                "id": "APPhy1.1.5.5",
                "text": "Projectile motion is a special case of two-dimensional motion that has zero acceleration in one dimension and constant, nonzero acceleration in the second dimension.",
                "raw_code": "1.5.B.2",
                "legacy_ids": [
                  "1.5.B.2"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.2",
        "name": "Unit 2: Force and Translational Dynamics",
        "objectives": [
          {
            "code": "APPhy1.2.1",
            "name": "Systems and Center of Mass",
            "legacy_codes": [
              "2.1.A",
              "2.1.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.1.1",
                "text": "System properties are determined by the interactions between objects within the",
                "raw_code": "2.1.A.1",
                "legacy_ids": [
                  "2.1.A.1"
                ]
              },
              {
                "id": "APPhy1.2.1.2",
                "text": "If the properties or interactions of the constituent objects within a system are not important in modeling the behavior of the macroscopic system, the system can itself be treated as a single object. Systems may allow interactions between constituent parts of the system and the environment, which may result in the transfer of energy or mass. Individual objects within a chosen system may behave differently from each other as well as from the system as a whole. The internal structure of a system affects the analysis of that system. As variables external to a system are changed, the system's substructure may change.",
                "raw_code": "2.1.A.2",
                "legacy_ids": [
                  "2.1.A.2"
                ]
              },
              {
                "id": "APPhy1.2.1.3",
                "text": "Systems may allow interactions between constituent parts of the system and the environment, which may result in the transfer of energy or mass.",
                "raw_code": "2.1.A.3",
                "legacy_ids": [
                  "2.1.A.3"
                ]
              },
              {
                "id": "APPhy1.2.1.4",
                "text": "Individual objects within a chosen system may behave differently from each other as well as from the system as a whole.",
                "raw_code": "2.1.A.4",
                "legacy_ids": [
                  "2.1.A.4"
                ]
              },
              {
                "id": "APPhy1.2.1.5",
                "text": "The internal structure of a system affects the analysis of that system.",
                "raw_code": "2.1.A.5",
                "legacy_ids": [
                  "2.1.A.5"
                ]
              },
              {
                "id": "APPhy1.2.1.6",
                "text": "As variables external to a system are changed, the system's substructure may change.",
                "raw_code": "2.1.A.6",
                "legacy_ids": [
                  "2.1.A.6"
                ]
              },
              {
                "id": "APPhy1.2.1.7",
                "text": "For objects or systems with symmetrical mass distributions, the center of mass is located on lines of symmetry.",
                "raw_code": "2.1.B.1",
                "legacy_ids": [
                  "2.1.B.1"
                ]
              },
              {
                "id": "APPhy1.2.1.8",
                "text": "The location of a system's center of mass along a given axis can be calculated using the equation $$\\\\vec{x}_{\\\\rm cm} = \\\\frac{\\\\sum m_i \\\\vec{x}_i}{\\\\sum m_i}$$ For a nonuniform solid that can be considered as a collection of differential masses, dm, the solid's center of mass can be calculated using the equation $$\\\\vec{r}_{\\\\rm cm} = \\\\frac{\\\\int \\\\vec{r} \\\\, dm}{\\\\int dm}.$$",
                "raw_code": "2.1.B.2",
                "legacy_ids": [
                  "2.1.B.2"
                ]
              },
              {
                "id": "APPhy1.2.1.9",
                "text": "A system can be modeled as a singular object that is located at the system's center of mass.",
                "raw_code": "2.1.B.3",
                "legacy_ids": [
                  "2.1.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.2",
            "name": "Forces and Free-Body Diagrams",
            "legacy_codes": [
              "2.2.A",
              "2.2.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.2.1",
                "text": "Forces are vector quantities that describe the interactions between objects or systems. A force exerted on an object or system is always due to the interaction of that object or system with another object or system. An object or system cannot exert a net force on itself.",
                "raw_code": "2.2.A.1",
                "legacy_ids": [
                  "2.2.A.1",
                  "2.2.A.1.i",
                  "2.2.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.2.2.2",
                "text": "Contact forces describe the interaction of an object or system touching another object or system and are macroscopic effects of interatomic electric forces.",
                "raw_code": "2.2.A.2",
                "legacy_ids": [
                  "2.2.A.2"
                ]
              },
              {
                "id": "APPhy1.2.2.3",
                "text": "Free-body diagrams are useful tools for visualizing forces being exerted on a single object or system and for determining the equations that represent a physical situation.",
                "raw_code": "2.2.B.1",
                "legacy_ids": [
                  "2.2.B.1"
                ]
              },
              {
                "id": "APPhy1.2.2.4",
                "text": "The free-body diagram of an object or system shows each of the forces exerted on the object or system by the environment.",
                "raw_code": "2.2.B.2",
                "legacy_ids": [
                  "2.2.B.2"
                ]
              },
              {
                "id": "APPhy1.2.2.5",
                "text": "Forces exerted on an object or system are represented as vectors originating from the representation of the center of mass, such as a dot. A system is treated as though all of its mass is located at the center of mass.",
                "raw_code": "2.2.B.3",
                "legacy_ids": [
                  "2.2.B.3"
                ]
              },
              {
                "id": "APPhy1.2.2.6",
                "text": "A coordinate system with one axis parallel to the direction of acceleration of the object or system simplifies the translation from freebody diagram to algebraic representation. For example, in a free-body diagram of an object on an inclined plane, it is useful to set one axis parallel to the surface of the incline.",
                "raw_code": "2.2.B.4",
                "legacy_ids": [
                  "2.2.B.4"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.3",
            "name": "Newton’s Third Law",
            "legacy_codes": [
              "2.3.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.3.1",
                "text": "Newton's third law describes the interaction of two objects or systems in terms of the paired forces that each exerts on the other. $$\\\\vec{F}_{A \\\\text{ on } B} = -\\\\vec{F}_{B \\\\text{ on } A}$$ Interactions between objects within a system (internal forces) do not influence the motion of a system's center of mass.",
                "raw_code": "2.3.A.1",
                "legacy_ids": [
                  "2.3.A.1"
                ]
              },
              {
                "id": "APPhy1.2.3.2",
                "text": "Tension is the macroscopic net result of forces that infinitesimal segments of a string, cable, chain, or similar system exert on each other in response to an external force.",
                "raw_code": "2.3.A.2",
                "legacy_ids": [
                  "2.3.A.2"
                ]
              },
              {
                "id": "APPhy1.2.3.3",
                "text": "An ideal string has negligible mass and does not stretch when under tension. The tension in an ideal string is the same at all points within the string. In a string with nonnegligible mass, tension may not be the same at all points within the string. An ideal pulley is a pulley that has negligible mass and rotates about an axle through its center of mass with negligible friction. An ideal pulley is a pulley that has negligible mass and rotates about an axle through its center of mass with negligible friction.",
                "raw_code": "2.3.A.3",
                "legacy_ids": [
                  "2.3.A.3",
                  "2.3.A.3.i",
                  "2.3.A.3.ii",
                  "2.3.A.3.iii",
                  "2.3.A.3.iv"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.4",
            "name": "Newton’s First Law",
            "legacy_codes": [
              "2.4.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.4.1",
                "text": "The net force on a system is the vector sum of all forces exerted on the system.",
                "raw_code": "2.4.A.1",
                "legacy_ids": [
                  "2.4.A.1"
                ]
              },
              {
                "id": "APPhy1.2.4.2",
                "text": "Translational equilibrium is the configuration of forces such that the net force exerted on a system is zero. Derived equation: $$\\\\sum \\\\vec{F}_i = 0$$ Newton's first law states that if the net force exerted on a system is zero, the velocity of that system will remain constant.",
                "raw_code": "2.4.A.2",
                "legacy_ids": [
                  "2.4.A.2"
                ]
              },
              {
                "id": "APPhy1.2.4.3",
                "text": "Newton's first law states that if the net force exerted on a system is zero, the velocity of that system will remain constant.",
                "raw_code": "2.4.A.3",
                "legacy_ids": [
                  "2.4.A.3"
                ]
              },
              {
                "id": "APPhy1.2.4.4",
                "text": "Forces may be balanced in one dimension but unbalanced in another. The system's velocity will change only in the direction of the unbalanced force.",
                "raw_code": "2.4.A.4",
                "legacy_ids": [
                  "2.4.A.4"
                ]
              },
              {
                "id": "APPhy1.2.4.5",
                "text": "An inertial reference frame is one from which an observer would verify Newton's first law of motion.",
                "raw_code": "2.4.A.5",
                "legacy_ids": [
                  "2.4.A.5"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.5",
            "name": "Newton’s Second Law",
            "legacy_codes": [
              "2.5.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.5.1",
                "text": "Unbalanced forces are a configuration of forces such that the net force exerted on a system is not equal to zero.",
                "raw_code": "2.5.A.1",
                "legacy_ids": [
                  "2.5.A.1"
                ]
              },
              {
                "id": "APPhy1.2.5.2",
                "text": "Newton's second law of motion states that the acceleration of a system's center of mass has a magnitude proportional to the magnitude of the net force exerted on the system and is in the same direction as that net force. Relevant equation: $$\\\\vec{a}_{\\\\text{sys}} = \\\\frac{\\\\sum \\\\vec{F}}{m_{\\\\text{sys}}} = \\\\frac{\\\\vec{F}_{\\\\text{net}}}{m_{\\\\text{sys}}}$$ The velocity of a system's center of mass will only change if a nonzero net external force is exerted on that system.",
                "raw_code": "2.5.A.2",
                "legacy_ids": [
                  "2.5.A.2"
                ]
              },
              {
                "id": "APPhy1.2.5.3",
                "text": "The velocity of a system's center of mass will only change if a nonzero net external force is exerted on that system.",
                "raw_code": "2.5.A.3",
                "legacy_ids": [
                  "2.5.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.6",
            "name": "Gravitational Force",
            "legacy_codes": [
              "2.6.A",
              "2.6.B",
              "2.6.C",
              "2.6.D"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.6.1",
                "text": "Newton's law of universal gravitation describes the gravitational force between two objects or systems as directly proportional to each of their masses and inversely proportional to the square of the distance between the systems' centers of mass. Relevant equation: $$\\\\left| \\\\vec{F}_{g} \\\\right| = G \\\\frac{m_{1} m_{2}}{r^{2}}$$ The gravitational force is attractive. The gravitational force is always exerted along the line connecting the center of mass of the two interacting systems. The gravitational force on a system can be considered to be exerted on the system's center of mass. A field models the effects of a noncontact force exerted on an object at various positions in space. The gravitational force is attractive. The gravitational force is always exerted along the line connecting the centers of mass of the two interacting systems. The gravitational force on a system can be considered to be exerted on the system's center of mass.",
                "raw_code": "2.6.A.1",
                "legacy_ids": [
                  "2.6.A.1",
                  "2.6.A.1.i",
                  "2.6.A.1.ii",
                  "2.6.A.1.iii"
                ]
              },
              {
                "id": "APPhy1.2.6.2",
                "text": "A field models the effects of a noncontact force exerted on an object at various positions in space. The magnitude of the gravitational field created by a system of mass M at a point in space is equal to the ratio of the gravitational force exerted by the system on a test object of mass m to the mass of the test object.",
                "raw_code": "2.6.A.2",
                "legacy_ids": [
                  "2.6.A.2",
                  "2.6.A.2.i",
                  "2.6.A.2.ii"
                ]
              },
              {
                "id": "APPhy1.2.6.3",
                "text": "The gravitational force exerted by an astronomical body on a relatively small nearby object is called weight. Derived Equation: Weight = $$F_g = mg$$",
                "raw_code": "2.6.A.3",
                "legacy_ids": [
                  "2.6.A.3"
                ]
              },
              {
                "id": "APPhy1.2.6.4",
                "text": "If the gravitational force between two systems' centers of mass has a negligible change as the relative position of the two systems changes, the gravitational force can be considered constant at all points between the initial and final positions of the systems.",
                "raw_code": "2.6.B.1",
                "legacy_ids": [
                  "2.6.B.1"
                ]
              },
              {
                "id": "APPhy1.2.6.5",
                "text": "Near the surface of Earth, the strength of the gravitational field is $g \\\\approx 10 \\\\text{ N/kg}$",
                "raw_code": "2.6.B.2",
                "legacy_ids": [
                  "2.6.B.2"
                ]
              },
              {
                "id": "APPhy1.2.6.6",
                "text": "The magnitude of the apparent weight of a system is the magnitude of the normal force exerted on the system. If the system is accelerating, the apparent weight of the system is not equal to the magnitude of the gravitational force exerted on the system.",
                "raw_code": "2.6.C.1",
                "legacy_ids": [
                  "2.6.C.1"
                ]
              },
              {
                "id": "APPhy1.2.6.7",
                "text": "If the system is accelerating, the apparent weight of the system is not equal to the magnitude of the gravitational force exerted on the system.",
                "raw_code": "2.6.C.2",
                "legacy_ids": [
                  "2.6.C.2"
                ]
              },
              {
                "id": "APPhy1.2.6.8",
                "text": "A system appears weightless when there are no forces exerted on the system or when the force of gravity is the only force exerted on the system.",
                "raw_code": "2.6.C.3",
                "legacy_ids": [
                  "2.6.C.3"
                ]
              },
              {
                "id": "APPhy1.2.6.9",
                "text": "The equivalence principle states that an observer in a noninertial reference frame is unable to distinguish between an object's apparent weight and the gravitational force exerted on the object by a gravitational field.",
                "raw_code": "2.6.C.4",
                "legacy_ids": [
                  "2.6.C.4"
                ]
              },
              {
                "id": "APPhy1.2.6.10",
                "text": "Objects have inertial mass, or inertia, a property that determines how much an object's motion resists changes when interacting with another object.",
                "raw_code": "2.6.D.1",
                "legacy_ids": [
                  "2.6.D.1"
                ]
              },
              {
                "id": "APPhy1.2.6.11",
                "text": "Gravitational mass is related to the force of attraction between two systems with mass.",
                "raw_code": "2.6.D.2",
                "legacy_ids": [
                  "2.6.D.2"
                ]
              },
              {
                "id": "APPhy1.2.6.12",
                "text": "Inertial mass and gravitational mass have been experimentally verified to be equivalent.",
                "raw_code": "2.6.D.3",
                "legacy_ids": [
                  "2.6.D.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.7",
            "name": "Kinetic and Static Friction",
            "legacy_codes": [
              "2.7.A",
              "2.7.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.7.1",
                "text": "Kinetic friction occurs when two surfaces in contact move relative to each other. The kinetic friction force is exerted in a direction opposite the motion of each surface relative to the other surface. The force of friction between two surfaces does not depend on the size of the surface area of contact. The magnitude of the kinetic friction force exerted on an object is the product of the normal force the surface exerts on the object and the coefficient of kinetic friction. Relevant equation: $$\\\\left| \\\\vec{F}_{f,k} \\\\right| = \\\\left| \\\\mu_k \\\\vec{F}_N \\\\right|$$ The coefficient of kinetic friction depends on the material properties of the surfaces that are in contact. The kinetic friction force is exerted in a direction opposite to the motion of each surface relative to the other surface. The force of friction between two surfaces does not depend on the size of the surface area of contact.",
                "raw_code": "2.7.A.1",
                "legacy_ids": [
                  "2.7.A.1",
                  "2.7.A.1.i",
                  "2.7.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.2.7.2",
                "text": "The magnitude of the kinetic friction force exerted on an object is the product of the normal force the surface exerts on the object and the coefficient of kinetic friction. Relevant equation: $$\\\\left| \\\\vec{F}_{f,k} \\\\right| = \\\\left| \\\\mu_k \\\\vec{F}_n \\\\right|$$ The coefficient of kinetic friction depends on the material properties of the surfaces that are in contact. Normal force is the perpendicular component of the force exerted on an object by the surface with which it is in contact; it is directed away from the surface.",
                "raw_code": "2.7.A.2",
                "legacy_ids": [
                  "2.7.A.2",
                  "2.7.A.2.i",
                  "2.7.A.2.ii"
                ]
              },
              {
                "id": "APPhy1.2.7.3",
                "text": "Static friction may occur between the contacting surfaces of two objects that are not moving relative to each other.",
                "raw_code": "2.7.B.1",
                "legacy_ids": [
                  "2.7.B.1"
                ]
              },
              {
                "id": "APPhy1.2.7.4",
                "text": "Static friction adopts the value and direction required to prevent an object from slipping or sliding on a surface. Relevant equation: $$\\\\left| \\\\overrightarrow{F}_{f,s} \\\\right| \\\\leq \\\\left| \\\\mu_s \\\\overrightarrow{F}_n \\\\right|$$ Slipping and sliding refer to situations in which two surfaces are moving relative to each other. There exists a maximum value for which static friction will prevent an object from slipping on a given surface. Derived equation: $$F_{f,s,\\\\max} = \\\\mu_s F_n$$",
                "raw_code": "2.7.B.2",
                "legacy_ids": [
                  "2.7.B.2",
                  "2.7.B.2.i",
                  "2.7.B.2.ii"
                ]
              },
              {
                "id": "APPhy1.2.7.5",
                "text": "The coefficient of static friction is typically greater than the coefficient of kinetic friction for a given pair of surfaces.",
                "raw_code": "2.7.B.3",
                "legacy_ids": [
                  "2.7.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.8",
            "name": "Spring Forces",
            "legacy_codes": [
              "2.8.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.8.1",
                "text": "An ideal spring has negligible mass and exerts a force that is proportional to the change in its length as measured from its relaxed length. The magnitude of the force exerted by an ideal spring on an object is given by Hooke's law: $$\\\\vec{F}_s = -k\\\\Delta \\\\vec{x}$$",
                "raw_code": "2.8.A.1",
                "legacy_ids": [
                  "2.8.A.1"
                ]
              },
              {
                "id": "APPhy1.2.8.2",
                "text": "The magnitude of the force exerted by an ideal spring on an object is given by Hooke’s law.",
                "raw_code": "2.8.A.2",
                "legacy_ids": [
                  "2.8.A.2"
                ]
              },
              {
                "id": "APPhy1.2.8.3",
                "text": "The force exerted on an object by a spring is always directed toward the equilibrium position of the object-spring system.",
                "raw_code": "2.8.A.3",
                "legacy_ids": [
                  "2.8.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.2.9",
            "name": "Circular Motion",
            "legacy_codes": [
              "2.9.A",
              "2.9.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.2.9.1",
                "text": "A resistive force is defined as a velocitydependent force in the opposite direction of an object's velocity, for example: $$\\\\vec{F}_r = -k\\\\vec{v}$$ The magnitude of centripetal acceleration for an object moving in a circular path is the ratio of the object's tangential speed squared to the radius of the circular path. Relevant equation: $$a_c = \\\\frac{v^2}{r}$$ Centripetal acceleration is directed toward the center of an object's circular path.",
                "raw_code": "2.9.A.1",
                "legacy_ids": [
                  "2.9.A.1",
                  "2.9.A.1.i",
                  "2.9.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.2.9.2",
                "text": "Applying Newton's second law to an object upon which a resistive force is exerted results in a differential equation for velocity. Using the method of separation of variables, the velocity can be determined by integrating over the proper limits of integration. The acceleration or position of a moving object that is subject to a velocity-dependent force may be determined using initial conditions of the object and methods of calculus, once a function for velocity is determined. The position, velocity, and acceleration as functions of time of an object under the influence of a resistive force of the form $\\\\vec{F}_{x} = -k\\\\vec{v}$ are exponential and have asymptotes that are determined by the initial conditions of the object and the forces exerted on the object. Terminal velocity is defined as the maximum speed achieved by an object moving under the influence of a constant force and a resistive force that are exerted on the object in opposite directions. The terminal condition is reached when the net force exerted on the object is zero. At the top of a vertical, circular loop, an object requires a minimum speed to maintain circular motion. At this point, and with this minimum speed, the gravitational force is the only force that causes the centripetal acceleration. Derived equation: $$v = \\\\sqrt{gr}$$ Components of the static friction force and the normal force can contribute to the net force producing centripetal acceleration of an object traveling in a circle on a banked surface. A component of tension contributes to the net force producing centripetal acceleration experienced by a conical pendulum.",
                "raw_code": "2.9.A.2",
                "legacy_ids": [
                  "2.9.A.2",
                  "2.9.A.2.i",
                  "2.9.A.2.ii",
                  "2.9.A.2.iii"
                ]
              },
              {
                "id": "APPhy1.2.9.3",
                "text": "Tangential acceleration is the rate at which an object's speed changes and is directed tangent to the object's circular path.",
                "raw_code": "2.9.A.3",
                "legacy_ids": [
                  "2.9.A.3"
                ]
              },
              {
                "id": "APPhy1.2.9.4",
                "text": "The net acceleration of an object moving in a circle is the vector sum of the centripetal acceleration and tangential acceleration. The revolution of an object traveling in a circular path at a constant speed (uniform circular motion) can be described using period and frequency.",
                "raw_code": "2.9.A.4",
                "legacy_ids": [
                  "2.9.A.4"
                ]
              },
              {
                "id": "APPhy1.2.9.5",
                "text": "The time to complete one full circular path, one full rotation, or a full cycle of oscillatory motion is defined as period, T. The rate at which an object is completing revolutions is defined as frequency, f. Relevant equation: $$T = \\\\frac{1}{f}$$ For an object traveling at a constant speed in a circular path, the period is given by the derived equation $$T = \\\\frac{2\\\\pi r}{v}.$$",
                "raw_code": "2.9.A.5",
                "legacy_ids": [
                  "2.9.A.5",
                  "2.9.A.5.i",
                  "2.9.A.5.ii",
                  "2.9.A.5.iii"
                ]
              },
              {
                "id": "APPhy1.2.9.6",
                "text": "For a satellite in circular orbit around a central body, the satellite's centripetal acceleration is caused only by gravitational attraction. The period and radius of the circular orbit are related to the mass of the central body. Derived equation: $$T^2 = \\\\frac{4\\\\pi^2}{GM}R^3$$",
                "raw_code": "2.9.B.1",
                "legacy_ids": [
                  "2.9.B.1"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.3",
        "name": "Unit 3: Work, Energy, and Power",
        "objectives": [
          {
            "code": "APPhy1.3.1",
            "name": "Translational Kinetic Energy",
            "legacy_codes": [
              "3.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.3.1.1",
                "text": "An object's translational kinetic energy is given by the equation $$K = \\\\frac{1}{2}mv^2.$$",
                "raw_code": "3.1.A.1",
                "legacy_ids": [
                  "3.1.A.1"
                ]
              },
              {
                "id": "APPhy1.3.1.2",
                "text": "Translational kinetic energy is a scalar quantity.",
                "raw_code": "3.1.A.2",
                "legacy_ids": [
                  "3.1.A.2"
                ]
              },
              {
                "id": "APPhy1.3.1.3",
                "text": "Different observers may measure different values of the translational kinetic energy of an object, depending on the observer’s frame of reference.",
                "raw_code": "3.1.A.3",
                "legacy_ids": [
                  "3.1.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.3.2",
            "name": "Work",
            "legacy_codes": [
              "3.2.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.3.2.1",
                "text": "Work is the amount of energy transferred into or out of a system by a force exerted on that system over a distance. The work done by a conservative force exerted on a system is path-independent and only depends on the initial and final configurations of that system. The work done by a conservative force on a system—or the change in the potential energy of the system—will be zero if the system returns to its initial configuration. Potential energies are associated only with conservative forces. The work done by a nonconservative force is path-dependent. Examples of nonconservative forces are friction and air resistance.",
                "raw_code": "3.2.A.1",
                "legacy_ids": [
                  "3.2.A.1",
                  "3.2.A.1.i",
                  "3.2.A.1.ii",
                  "3.2.A.1.iii",
                  "3.2.A.1.iv",
                  "3.2.A.1.v"
                ]
              },
              {
                "id": "APPhy1.3.2.2",
                "text": "Work is a scalar quantity that may be positive, negative, or zero.",
                "raw_code": "3.2.A.2",
                "legacy_ids": [
                  "3.2.A.2"
                ]
              },
              {
                "id": "APPhy1.3.2.3",
                "text": "The amount of work done on a system by a constant force is related to the components of that force and the displacement of the point at which that force is exerted. Only the component of the force exerted on a system that is parallel to the displacement of the point of application of the force will change the system's total energy. Relevant equation: $$W = F_{||}d = Fd \\\\cos\\\\theta$$ The component of the force exerted on a system perpendicular to the direction of the displacement of the system's center of mass can change the direction of the system's motion without changing the system's kinetic energy.",
                "raw_code": "3.2.A.3",
                "legacy_ids": [
                  "3.2.A.3",
                  "3.2.A.3.i",
                  "3.2.A.3.ii"
                ]
              },
              {
                "id": "APPhy1.3.2.4",
                "text": "The work-energy theorem states that the change in an object's kinetic energy is equal to the sum of the work (net work) being done by all forces exerted on the object. Relevant equation: $$\\\\Delta K = \\\\sum_{i} W_{i} = \\\\sum_{i} F_{||,i} d$$ An external force may change the configuration of a system. The component of the external force parallel to the displacement times the displacement of the point of application of the force gives the change in kinetic energy of the system. If the system's center of mass and the point of application of the force move the same distance when a force is exerted on a system, then the system may be modeled as an object, and only the system's kinetic energy can change. The energy dissipated by friction is typically equated to the force of friction times the length of the path over which the force is exerted $$\\\\Delta E_{\\\\rm mech} = F_f d \\\\cos \\\\theta$$",
                "raw_code": "3.2.A.4",
                "legacy_ids": [
                  "3.2.A.4",
                  "3.2.A.4.i",
                  "3.2.A.4.ii",
                  "3.2.A.4.iii"
                ]
              },
              {
                "id": "APPhy1.3.2.5",
                "text": "Work is equal to the area under the curve of a graph of $F_{\\\\parallel}$ as a function of displacement.",
                "raw_code": "3.2.A.5",
                "legacy_ids": [
                  "3.2.A.5"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.3.3",
            "name": "Potential Energy",
            "legacy_codes": [
              "3.3.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.3.3.1",
                "text": "A system composed of two or more objects has potential energy if the objects within that system only interact with each other through conservative forces. Potential energy is a scalar quantity associated with the position of objects within a system. The definition of zero potential energy for a given system is a decision made by the observer considering the situation to simplify or otherwise assist in analysis. The relationship between conservative forces exerted on a system and the system's potential $$\\\\Delta U = -\\\\int_{a}^{b} \\\\vec{F}_{cf}(r) \\\\cdot d\\\\vec{r} \\\\cdot$$ The conservative forces exerted on a system in a single dimension can be determined using the slope of the system's potential energy with respect to position in that dimension; these forces point in the direction of decreasing potential energy. Relevant equation: $$F_{x} = -\\\\frac{dU(x)}{dx}$$",
                "raw_code": "3.3.A.1",
                "legacy_ids": [
                  "3.3.A.1"
                ]
              },
              {
                "id": "APPhy1.3.3.2",
                "text": "Potential energy is a scalar quantity associated with the position of objects within a system.",
                "raw_code": "3.3.A.2",
                "legacy_ids": [
                  "3.3.A.2"
                ]
              },
              {
                "id": "APPhy1.3.3.3",
                "text": "The definition of zero potential energy for a given system is a decision made by the observer considering the situation to simplify or otherwise assist in analysis.",
                "raw_code": "3.3.A.3",
                "legacy_ids": [
                  "3.3.A.3"
                ]
              },
              {
                "id": "APPhy1.3.3.4",
                "text": "The general form for the gravitational potential energy of a system consisting of two approximately spherical distributions of mass (e.g., moons, planets or stars) is given by the equation $$U_g = -G \\\\frac{m_1 m_2}{r}$$ Because the gravitational field near the surface of a planet is nearly constant, the change in gravitational potential energy in a system consisting of an object with mass m and a planet with gravitational field of magnitude g when the object is near the surface of the planet may be approximated by the equation $$\\\\Delta U_g = mg\\\\Delta y$$ .",
                "raw_code": "3.3.A.4",
                "legacy_ids": [
                  "3.3.A.4",
                  "3.3.A.4.i",
                  "3.3.A.4.ii",
                  "3.3.A.4.iii"
                ]
              },
              {
                "id": "APPhy1.3.3.5",
                "text": "The total potential energy of a system containing more than two objects is the sum of the potential energy of each pair of objects within the system.",
                "raw_code": "3.3.A.5",
                "legacy_ids": [
                  "3.3.A.5"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.3.4",
            "name": "Conservation of Energy",
            "legacy_codes": [
              "3.4.A",
              "3.4.B",
              "3.4.C"
            ],
            "subtopics": [
              {
                "id": "APPhy1.3.4.1",
                "text": "A system composed of only a single object can only have kinetic energy.",
                "raw_code": "3.4.A.1",
                "legacy_ids": [
                  "3.4.A.1"
                ]
              },
              {
                "id": "APPhy1.3.4.2",
                "text": "A system that contains objects that interact via conservative forces or that can change its shape reversibly may have both kinetic and potential energies.",
                "raw_code": "3.4.A.2",
                "legacy_ids": [
                  "3.4.A.2"
                ]
              },
              {
                "id": "APPhy1.3.4.3",
                "text": "Mechanical energy is the sum of a system's kinetic and potential energies.",
                "raw_code": "3.4.B.1",
                "legacy_ids": [
                  "3.4.B.1"
                ]
              },
              {
                "id": "APPhy1.3.4.4",
                "text": "Any change to a type of energy within a system must be balanced by an equivalent change of other types of energies within the system or by a transfer of energy between the system and its surroundings.",
                "raw_code": "3.4.B.2",
                "legacy_ids": [
                  "3.4.B.2"
                ]
              },
              {
                "id": "APPhy1.3.4.5",
                "text": "A system may be selected so that the total energy of that system is constant.",
                "raw_code": "3.4.B.3",
                "legacy_ids": [
                  "3.4.B.3"
                ]
              },
              {
                "id": "APPhy1.3.4.6",
                "text": "If the total energy of a system changes, that change will be equivalent to the energy transferred into or out of the system.",
                "raw_code": "3.4.B.4",
                "legacy_ids": [
                  "3.4.B.4"
                ]
              },
              {
                "id": "APPhy1.3.4.7",
                "text": "Energy is conserved in all interactions.",
                "raw_code": "3.4.C.1",
                "legacy_ids": [
                  "3.4.C.1"
                ]
              },
              {
                "id": "APPhy1.3.4.8",
                "text": "If the work done on a selected system is zero and there are no nonconservative interactions within the system, the total mechanical energy of the system is constant.",
                "raw_code": "3.4.C.2",
                "legacy_ids": [
                  "3.4.C.2"
                ]
              },
              {
                "id": "APPhy1.3.4.9",
                "text": "If the work done on a selected system is nonzero, energy is transferred between the system and the environment.",
                "raw_code": "3.4.C.3",
                "legacy_ids": [
                  "3.4.C.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.3.5",
            "name": "Power",
            "legacy_codes": [
              "3.5.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.3.5.1",
                "text": "Power is the rate at which energy changes with respect to time, either by transfer into or out of a system or by conversion from one type to another within a system.",
                "raw_code": "3.5.A.1",
                "legacy_ids": [
                  "3.5.A.1"
                ]
              },
              {
                "id": "APPhy1.3.5.2",
                "text": "Average power is the amount of energy being transferred or converted, divided by the time it took for that transfer or conversion to occur. Relevant equation: $$P_{\\\\text{avg}} = \\\\frac{\\\\Delta E}{\\\\Delta t}$$",
                "raw_code": "3.5.A.2",
                "legacy_ids": [
                  "3.5.A.2"
                ]
              },
              {
                "id": "APPhy1.3.5.3",
                "text": "Because work is the change in energy of an object or system due to a force, average power is the total work done, divided by the time during which that work was done. Relevant equation: $$P_{\\\\text{avg}} = \\\\frac{W}{\\\\Delta t}$$",
                "raw_code": "3.5.A.3",
                "legacy_ids": [
                  "3.5.A.3"
                ]
              },
              {
                "id": "APPhy1.3.5.4",
                "text": "The instantaneous power delivered to an object by the component of a constant force parallel to the object's velocity can be described with the derived equation. $$P_{\\\\text{inst}} = F_{\\\\parallel} v = Fv \\\\cos \\\\theta.$$",
                "raw_code": "3.5.A.4",
                "legacy_ids": [
                  "3.5.A.4"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.4",
        "name": "Unit 4: Linear Momentum",
        "objectives": [
          {
            "code": "APPhy1.4.1",
            "name": "Linear Momentum",
            "legacy_codes": [
              "4.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.4.1.1",
                "text": "Linear momentum is defined by the equation $\\\\vec{p} = m\\\\vec{v}$ .",
                "raw_code": "4.1.A.1",
                "legacy_ids": [
                  "4.1.A.1"
                ]
              },
              {
                "id": "APPhy1.4.1.2",
                "text": "Momentum is a vector quantity and has the same direction as the velocity.",
                "raw_code": "4.1.A.2",
                "legacy_ids": [
                  "4.1.A.2"
                ]
              },
              {
                "id": "APPhy1.4.1.3",
                "text": "Momentum can be used to analyze collisions and explosions. A collision is a model for an interaction where the forces exerted between the involved objects in the system are much larger than the net external force exerted on those objects during the interaction. As only the initial and final states of a collision are analyzed, the object model may be used to analyze collisions. An explosion is a model for an interaction in which forces internal to the system move objects within that system apart. An explosion is a model for an interaction in which forces internal to the system move objects within that system apart.",
                "raw_code": "4.1.A.3",
                "legacy_ids": [
                  "4.1.A.3",
                  "4.1.A.3.i",
                  "4.1.A.3.ii",
                  "4.1.A.3.iii"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.4.2",
            "name": "Change in Momentum and Impulse",
            "legacy_codes": [
              "4.2.A",
              "4.2.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.4.2.1",
                "text": "The rate of change of a system's momentum is equal to the net external force exerted on that system. Relevant equation: $$\\\\vec{F}_{\\\\text{net}} = \\\\frac{d\\\\vec{p}}{dt}$$",
                "raw_code": "4.2.A.1",
                "legacy_ids": [
                  "4.2.A.1"
                ]
              },
              {
                "id": "APPhy1.4.2.2",
                "text": "Impulse is defined as the integral of a force exerted on an object or system over a time interval. Relevant equation: $$\\\\vec{J} = \\\\int_{t}^{t_2} \\\\vec{F}_{\\\\text{net}}(t) dt$$",
                "raw_code": "4.2.A.2",
                "legacy_ids": [
                  "4.2.A.2"
                ]
              },
              {
                "id": "APPhy1.4.2.3",
                "text": "Impulse is a vector quantity and has the same direction as the net force exerted on the system.",
                "raw_code": "4.2.A.3",
                "legacy_ids": [
                  "4.2.A.3"
                ]
              },
              {
                "id": "APPhy1.4.2.4",
                "text": "The impulse delivered to a system by a net external force is equal to the area under the curve of a graph of the net external force exerted on the system as a function of time.",
                "raw_code": "4.2.A.4",
                "legacy_ids": [
                  "4.2.A.4"
                ]
              },
              {
                "id": "APPhy1.4.2.5",
                "text": "The net external force exerted on a system is equal to the slope of a graph of the momentum of the system as a function of time.",
                "raw_code": "4.2.A.5",
                "legacy_ids": [
                  "4.2.A.5"
                ]
              },
              {
                "id": "APPhy1.4.2.6",
                "text": "Change in momentum is the difference between a system's final momentum and its initial momentum. Relevant equation: $$\\\\Delta \\\\vec{p} = \\\\vec{p} - \\\\vec{p}_0$$",
                "raw_code": "4.2.B.1",
                "legacy_ids": [
                  "4.2.B.1"
                ]
              },
              {
                "id": "APPhy1.4.2.7",
                "text": "The impulse–momentum theorem relates the impulse exerted on a system and the system's change in momentum. Relevant equation: $$\\\\vec{J} = \\\\vec{F}_{\\\\text{avg}} \\\\Delta t = \\\\Delta \\\\vec{p}$$",
                "raw_code": "4.2.B.2",
                "legacy_ids": [
                  "4.2.B.2"
                ]
              },
              {
                "id": "APPhy1.4.2.8",
                "text": "Newton's second law of motion is a direct result of the impulse–momentum theorem applied to systems with constant mass. Relevant equation $$\\\\overline{F}_{\\\\text{net}} = \\\\frac{\\\\Delta \\\\overline{p}}{\\\\Delta t} = m \\\\frac{\\\\Delta \\\\vec{v}}{\\\\Delta t} = m \\\\vec{a}$$",
                "raw_code": "4.2.B.3",
                "legacy_ids": [
                  "4.2.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.4.3",
            "name": "Conservation of Linear Momentum",
            "legacy_codes": [
              "4.3.A",
              "4.3.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.4.3.1",
                "text": "A collection of objects with individual momenta can be described as one system with one center-of-mass velocity. For a collection of objects, the velocity of a system's center of mass can be calculated using the equation $$\\\\vec{v}_{\\\\rm cm} = \\\\frac{\\\\sum \\\\vec{p}_i}{\\\\sum m_i} = \\\\frac{\\\\sum (m_i \\\\vec{v}_i)}{\\\\sum m_i}.$$ The velocity of a system's center of mass is constant in the absence of a net external force",
                "raw_code": "4.3.A.1",
                "legacy_ids": [
                  "4.3.A.1",
                  "4.3.A.1.i",
                  "4.3.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.4.3.2",
                "text": "The total momentum of a system is the sum of the momenta of the system's constituent parts.",
                "raw_code": "4.3.A.2",
                "legacy_ids": [
                  "4.3.A.2"
                ]
              },
              {
                "id": "APPhy1.4.3.3",
                "text": "In the absence of net external forces, any change to the momentum of an object within a system must be balanced by an equivalent and opposite change of momentum elsewhere within the system. Any change to the momentum of a system is due to a transfer of momentum between the system and its surroundings. The impulse exerted by one object on a second object is equal and opposite to the impulse exerted by the second object on the first. This is a direct result of Newton's third law. A system may be selected so that the total momentum of that system is constant. If the total momentum of a system changes, that change will be equivalent to the impulse exerted on the system. Relevant equation: $$\\\\vec{J} = \\\\Delta \\\\vec{p}$$",
                "raw_code": "4.3.A.3",
                "legacy_ids": [
                  "4.3.A.3",
                  "4.3.A.3.i",
                  "4.3.A.3.ii",
                  "4.3.A.3.iii"
                ]
              },
              {
                "id": "APPhy1.4.3.4",
                "text": "Correct application of conservation of momentum can be used to determine the velocity of a system immediately before and immediately after collisions or explosions.",
                "raw_code": "4.3.A.4",
                "legacy_ids": [
                  "4.3.A.4"
                ]
              },
              {
                "id": "APPhy1.4.3.5",
                "text": "Momentum is conserved in all interactions.",
                "raw_code": "4.3.B.1",
                "legacy_ids": [
                  "4.3.B.1"
                ]
              },
              {
                "id": "APPhy1.4.3.6",
                "text": "If the net external force on the selected system is zero, the total momentum of the system is constant.",
                "raw_code": "4.3.B.2",
                "legacy_ids": [
                  "4.3.B.2"
                ]
              },
              {
                "id": "APPhy1.4.3.7",
                "text": "If the net external force on the selected system is nonzero, momentum is transferred between the system and the environment.",
                "raw_code": "4.3.B.3",
                "legacy_ids": [
                  "4.3.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.4.4",
            "name": "Elastic and Inelastic Collisions",
            "legacy_codes": [
              "4.4.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.4.4.1",
                "text": "An elastic collision between objects is one in which the initial kinetic energy of the system is equal to the final kinetic energy of the system.",
                "raw_code": "4.4.A.1",
                "legacy_ids": [
                  "4.4.A.1"
                ]
              },
              {
                "id": "APPhy1.4.4.2",
                "text": "In an elastic collision, the final kinetic energies of each of the objects within the system may be different from their initial kinetic energies.",
                "raw_code": "4.4.A.2",
                "legacy_ids": [
                  "4.4.A.2"
                ]
              },
              {
                "id": "APPhy1.4.4.3",
                "text": "An inelastic collision between objects is one in which the total kinetic energy of the system decreases.",
                "raw_code": "4.4.A.3",
                "legacy_ids": [
                  "4.4.A.3"
                ]
              },
              {
                "id": "APPhy1.4.4.4",
                "text": "In an inelastic collision, some of the initial kinetic energy is not restored to kinetic energy but is transformed by nonconservative forces into other forms of energy.",
                "raw_code": "4.4.A.4",
                "legacy_ids": [
                  "4.4.A.4"
                ]
              },
              {
                "id": "APPhy1.4.4.5",
                "text": "In a perfectly inelastic collision, the objects stick together and move with the same velocity after the collision.",
                "raw_code": "4.4.A.5",
                "legacy_ids": [
                  "4.4.A.5"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.5",
        "name": "Unit 5: Torque and Rotational Dynamics",
        "objectives": [
          {
            "code": "APPhy1.5.1",
            "name": "Rotational Kinematics",
            "legacy_codes": [
              "5.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.1.1",
                "text": "Angular displacement is the measurement of the angle, in radians, through which a point on a rigid system rotates about a specified axis. Relevant equation: $$\\\\Delta \\\\theta = \\\\theta - \\\\theta_0$$ A rigid system is one that holds its shape but in which different points on the system move in different directions during rotation. A rigid system cannot be modeled as an object. One direction of angular displacement about an axis of rotation—clockwise or counterclockwise—is typically indicated as mathematically positive, with the other direction becoming mathematically negative. If the rotation of a system about an axis may be well described using the motion of the system's center of mass, the system may be treated as a single object. For example, the rotation of Earth about its axis may be considered negligible when considering the revolution of Earth about the center of mass of the Earth-Sun system.",
                "raw_code": "5.1.A.1",
                "legacy_ids": [
                  "5.1.A.1",
                  "5.1.A.1.i",
                  "5.1.A.1.ii",
                  "5.1.A.1.iii"
                ]
              },
              {
                "id": "APPhy1.5.1.2",
                "text": "Average angular velocity is the average rate at which angular position changes with respect to time. Relevant equation: $$\\\\omega_{\\\\rm avg} = \\\\frac{\\\\Delta \\\\theta}{\\\\Delta t}$$",
                "raw_code": "5.1.A.2",
                "legacy_ids": [
                  "5.1.A.2"
                ]
              },
              {
                "id": "APPhy1.5.1.3",
                "text": "Average angular acceleration is the average rate at which the angular velocity changes with respect to time. Relevant equation: $$\\\\alpha_{\\\\text{avg}} = \\\\frac{\\\\Delta \\\\omega}{\\\\Delta t}$$",
                "raw_code": "5.1.A.3",
                "legacy_ids": [
                  "5.1.A.3"
                ]
              },
              {
                "id": "APPhy1.5.1.4",
                "text": "Angular displacement, angular velocity, and angular acceleration around one axis are analogous to linear displacement, velocity, and acceleration in one dimension and demonstrate the same mathematical relationships. For constant angular acceleration, the mathematical relationships between angular displacement, angular velocity, and angular acceleration can be described with the following equations: $$\\\\omega = \\\\omega_0 + \\\\alpha t$$ $$\\\\theta = \\\\theta_0 + \\\\omega_0 t + \\\\frac{1}{2} \\\\alpha t^2$$ $$\\\\omega^2 = \\\\omega_0^2 + 2\\\\alpha(\\\\theta - \\\\theta_0)$$ Graphs of angular displacement, angular velocity, and angular acceleration as functions of time can be used to find the relationships between those quantities.",
                "raw_code": "5.1.A.4",
                "legacy_ids": [
                  "5.1.A.4",
                  "5.1.A.4.i",
                  "5.1.A.4.ii"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.5.2",
            "name": "Connecting Linear and Rotational Motion",
            "legacy_codes": [
              "5.2.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.2.1",
                "text": "For a point at a distance r from a fixed axis of rotation, the linear distance s traveled by the point as the system rotates through an angle $\\\\Delta\\\\theta$ is given by the equation $\\\\Delta s = r\\\\Delta\\\\theta$.",
                "raw_code": "5.2.A.1",
                "legacy_ids": [
                  "5.2.A.1"
                ]
              },
              {
                "id": "APPhy1.5.2.2",
                "text": "Derived relationships of linear velocity and of the tangential component of acceleration to their respective angular quantities are given by the following equations: $s = r\\\\theta$ $v = r\\\\omega$ $a_T = r\\\\alpha$",
                "raw_code": "5.2.A.2",
                "legacy_ids": [
                  "5.2.A.2"
                ]
              },
              {
                "id": "APPhy1.5.2.3",
                "text": "For a rigid system, all points within that system have the same angular velocity and angular acceleration.",
                "raw_code": "5.2.A.3",
                "legacy_ids": [
                  "5.2.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.5.3",
            "name": "Torque",
            "legacy_codes": [
              "5.3.A",
              "5.3.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.3.1",
                "text": "Torque results only from the force component perpendicular to the position vector from the axis of rotation to the point of application of the force.",
                "raw_code": "5.3.A.1",
                "legacy_ids": [
                  "5.3.A.1"
                ]
              },
              {
                "id": "APPhy1.5.3.2",
                "text": "The lever arm is the perpendicular distance from the axis of rotation to the line of action of the exerted force.",
                "raw_code": "5.3.A.2",
                "legacy_ids": [
                  "5.3.A.2"
                ]
              },
              {
                "id": "APPhy1.5.3.3",
                "text": "Torques can be described using force diagrams. Force diagrams are similar to free-body diagrams and are used to analyze the torques exerted on a rigid system. Similar to free-body diagrams, force diagrams represent the relative magnitude and direction of the forces exerted on a rigid system. Force diagrams also depict the location at which those forces are exerted relative to the axis of rotation.",
                "raw_code": "5.3.B.1",
                "legacy_ids": [
                  "5.3.B.1",
                  "5.3.B.1.i",
                  "5.3.B.1.ii"
                ]
              },
              {
                "id": "APPhy1.5.3.4",
                "text": "The magnitude of the torque exerted on a rigid system by a force is described by the following equation, where $\\\\theta$ is the angle between the force vector and the position vector from the axis of rotation to the point of application of the force. $$\\\\tau = rF_{\\\\perp} = rF \\\\sin \\\\theta$$",
                "raw_code": "5.3.B.2",
                "legacy_ids": [
                  "5.3.B.2"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.5.4",
            "name": "Rotational Inertia",
            "legacy_codes": [
              "5.4.A",
              "5.4.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.4.1",
                "text": "Rotational inertia measures a rigid system's resistance to changes in rotation and is related to the mass of the system and the distribution of that mass relative to the axis of rotation.",
                "raw_code": "5.4.A.1",
                "legacy_ids": [
                  "5.4.A.1"
                ]
              },
              {
                "id": "APPhy1.5.4.2",
                "text": "The rotational inertia of an object rotating a perpendicular distance r from an axis is described by the equation $$I = mr^2$$.",
                "raw_code": "5.4.A.2",
                "legacy_ids": [
                  "5.4.A.2"
                ]
              },
              {
                "id": "APPhy1.5.4.3",
                "text": "The total rotational inertia of a collection of objects about an axis is the sum of the rotational inertias of each object about that axis. $$I_{\\\\text{tot}} = \\\\sum I_i = \\\\sum m_i r_i^2$$",
                "raw_code": "5.4.A.3",
                "legacy_ids": [
                  "5.4.A.3"
                ]
              },
              {
                "id": "APPhy1.5.4.4",
                "text": "A rigid system's rotational inertia in a given plane is at a minimum when the rotational axis passes through the system's center of mass.",
                "raw_code": "5.4.B.1",
                "legacy_ids": [
                  "5.4.B.1"
                ]
              },
              {
                "id": "APPhy1.5.4.5",
                "text": "The parallel axis theorem uses the following equation to relate the rotational inertia of a rigid system about any axis that is parallel to an axis through its center of mass: $$I' = I_{\\\\rm cm} + Md^2$$",
                "raw_code": "5.4.B.2",
                "legacy_ids": [
                  "5.4.B.2"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.5.5",
            "name": "Rotational Equilibrium and Newton’s First Law in Rotational Form",
            "legacy_codes": [
              "5.5.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.5.1",
                "text": "A system may exhibit rotational equilibrium (constant angular velocity) without being in translational equilibrium, and vice versa. Free-body and force diagrams describe the nature of the forces and torques exerted on an object or rigid system. Rotational equilibrium is a configuration of torques such that the net torque exerted on the system is zero. Relevant equation: $$\\\\sum \\\\tau_i = 0$$ The rotational analog of Newton's first law is that a system will have a constant angular velocity only if the net torque exerted on the system is zero.",
                "raw_code": "5.5.A.1",
                "legacy_ids": [
                  "5.5.A.1",
                  "5.5.A.1.i",
                  "5.5.A.1.ii",
                  "5.5.A.1.iii"
                ]
              },
              {
                "id": "APPhy1.5.5.2",
                "text": "A rotational corollary to Newton's second law states that if the torques exerted on a rigid system are not balanced, the system's angular velocity must be changing.",
                "raw_code": "5.5.A.2",
                "legacy_ids": [
                  "5.5.A.2"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.5.6",
            "name": "Newton’s Second Law in Rotational Form",
            "legacy_codes": [
              "5.6.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.5.6.1",
                "text": "Angular velocity changes when the net torque exerted on the object or system is not equal to 7ero",
                "raw_code": "5.6.A.1",
                "legacy_ids": [
                  "5.6.A.1"
                ]
              },
              {
                "id": "APPhy1.5.6.2",
                "text": "The rate at which the angular velocity of a rigid system changes is directly proportional to the net torque exerted on the rigid system and is in the same direction. The angular acceleration of the rigid system is inversely proportional to the rotational inertia of the rigid system. Relevant equation: $$\\\\alpha_{\\\\rm sys} = \\\\frac{\\\\Sigma \\\\tau}{I_{\\\\rm sys}} = \\\\frac{\\\\tau_{\\\\rm net}}{I_{\\\\rm sys}}$$ To fully describe a rotating rigid system, linear and rotational analyses may need to be performed independently.",
                "raw_code": "5.6.A.2",
                "legacy_ids": [
                  "5.6.A.2"
                ]
              },
              {
                "id": "APPhy1.5.6.3",
                "text": "To fully describe a rotating rigid system, linear and rotational analyses may need to be performed independently.",
                "raw_code": "5.6.A.3",
                "legacy_ids": [
                  "5.6.A.3"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.6",
        "name": "Unit 6: Energy and Momentum of Rotating Systems",
        "objectives": [
          {
            "code": "APPhy1.6.1",
            "name": "Rotational Kinetic Energy",
            "legacy_codes": [
              "6.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.1.1",
                "text": "The rotational kinetic energy of an object or rigid system is related to the rotational inertia and angular velocity of the rigid system and is given by the equation $$K_{\\\\rm rot} = \\\\frac{1}{2}I\\\\omega^2$$ . The rotational inertia of an object about a fixed axis can be used to show that the rotational kinetic energy of that object is equivalent to its translational kinetic energy, which is its total kinetic energy. The total kinetic energy of a rigid system is the sum of its rotational kinetic energy due to its rotation about its center of mass and the translational kinetic energy due to the linear motion of its center of mass.",
                "raw_code": "6.1.A.1",
                "legacy_ids": [
                  "6.1.A.1",
                  "6.1.A.1.i",
                  "6.1.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.6.1.2",
                "text": "A rigid system can have rotational kinetic energy while its center of mass is at rest due to the individual points within the rigid system having linear speed and, therefore, kinetic energy.",
                "raw_code": "6.1.A.2",
                "legacy_ids": [
                  "6.1.A.2"
                ]
              },
              {
                "id": "APPhy1.6.1.3",
                "text": "Rotational kinetic energy is a scalar quantity.",
                "raw_code": "6.1.A.3",
                "legacy_ids": [
                  "6.1.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.6.2",
            "name": "Torque and Work",
            "legacy_codes": [
              "6.2.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.2.1",
                "text": "A torque can transfer energy into or out of an object or rigid system if the torque is exerted over an angular displacement.",
                "raw_code": "6.2.A.1",
                "legacy_ids": [
                  "6.2.A.1"
                ]
              },
              {
                "id": "APPhy1.6.2.2",
                "text": "The amount of work done on a rigid system by a torque is related to the magnitude of that torque and the angular displacement through which the rigid system rotates during the interval in which that torque is exerted. Relevant equation: $$W = \\\\int_{\\\\theta_1}^{\\\\theta_2} \\\\tau \\\\, d\\\\theta$$",
                "raw_code": "6.2.A.2",
                "legacy_ids": [
                  "6.2.A.2"
                ]
              },
              {
                "id": "APPhy1.6.2.3",
                "text": "Work done on a rigid system by a given torque can be found from the area under the curve of a graph of the torque as a function of angular position.",
                "raw_code": "6.2.A.3",
                "legacy_ids": [
                  "6.2.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.6.3",
            "name": "Angular Momentum and Angular Impulse",
            "legacy_codes": [
              "6.3.A",
              "6.3.B",
              "6.3.C"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.3.1",
                "text": "The magnitude of the angular momentum of a rigid system about a specific axis can be described with the equation $L = I\\\\omega$ .",
                "raw_code": "6.3.A.1",
                "legacy_ids": [
                  "6.3.A.1"
                ]
              },
              {
                "id": "APPhy1.6.3.2",
                "text": "The angular momentum of an object about a given point is $$\\\\vec{L} = \\\\vec{r} \\\\times \\\\vec{p}$$ . The selection of the axis about which an object is considered to rotate influences the determination of the angular momentum of that object. The measured angular momentum of an object traveling in a straight line depends on the distance between the reference point and the object, the mass of the object, the speed of the object, and the angle between the radial distance and the velocity of the object.",
                "raw_code": "6.3.A.2",
                "legacy_ids": [
                  "6.3.A.2",
                  "6.3.A.2.i",
                  "6.3.A.2.ii"
                ]
              },
              {
                "id": "APPhy1.6.3.3",
                "text": "Angular impulse is defined as the product of the torque exerted on an object or rigid system and the time interval during which the torque is exerted. Relevant equation: angular impluse = $\\\\int \\\\tau dt$",
                "raw_code": "6.3.B.1",
                "legacy_ids": [
                  "6.3.B.1"
                ]
              },
              {
                "id": "APPhy1.6.3.4",
                "text": "Angular impulse has the same direction as the torque imparting it.",
                "raw_code": "6.3.B.2",
                "legacy_ids": [
                  "6.3.B.2"
                ]
              },
              {
                "id": "APPhy1.6.3.5",
                "text": "The angular impulse delivered to an object or rigid system by a torque can be found from the area under the curve of a graph of the torque as a function of time.",
                "raw_code": "6.3.B.3",
                "legacy_ids": [
                  "6.3.B.3"
                ]
              },
              {
                "id": "APPhy1.6.3.6",
                "text": "The magnitude of the change in angular momentum can be described by comparing the magnitudes of the final and initial angular momenta of the object or rigid system: $$\\\\Delta L = L - L_0$$",
                "raw_code": "6.3.C.1",
                "legacy_ids": [
                  "6.3.C.1"
                ]
              },
              {
                "id": "APPhy1.6.3.7",
                "text": "A rotational form of the impulse–momentum theorem relates the angular impulse delivered to an object or rigid system and the change in angular momentum of that object or rigid system. The angular impulse exerted on an object or rigid system is equal to the change in angular momentum of that object or rigid system. Relevant equation: $$\\\\Delta L = \\\\tau \\\\Delta t$$ The rotational form of the impulse momentum theorem is a direct result of the rotational form of Newton's second law of motion for cases in which rotational inertia is constant: $$\\\\tau_{\\\\rm net} = \\\\frac{\\\\Delta L}{\\\\Delta t} = I \\\\frac{\\\\Delta \\\\omega}{\\\\Delta t} = I \\\\alpha$$",
                "raw_code": "6.3.C.2",
                "legacy_ids": [
                  "6.3.C.2",
                  "6.3.C.2.i",
                  "6.3.C.2.ii"
                ]
              },
              {
                "id": "APPhy1.6.3.8",
                "text": "The net torque exerted on an object is equal to the slope of the graph of the angular momentum of an object as a function of time.",
                "raw_code": "6.3.C.3",
                "legacy_ids": [
                  "6.3.C.3"
                ]
              },
              {
                "id": "APPhy1.6.3.9",
                "text": "The angular impulse delivered to an object is equal to the area under the curve of a graph of the net external torque exerted on an object as a function of time.",
                "raw_code": "6.3.C.4",
                "legacy_ids": [
                  "6.3.C.4"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.6.4",
            "name": "Conservation of Angular Momentum",
            "legacy_codes": [
              "6.4.A",
              "6.4.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.4.1",
                "text": "The total angular momentum of a system about a rotational axis is the sum of the angular momenta of the system's constituent parts about that rotational axis. Any change to a system's angular momentum must be due to an interaction between the system and its surroundings.",
                "raw_code": "6.4.A.1",
                "legacy_ids": [
                  "6.4.A.1"
                ]
              },
              {
                "id": "APPhy1.6.4.2",
                "text": "Any change to a system's angular momentum must be due to an interaction between the system and its surroundings. The angular impulse exerted by one object or system on a second object or system is egual and opposite to the angular impulse exerted by the second object or system on the first. This is a direct result of Newton's third law A system may be selected so that the total angular momentum of that system is constant. The angular speed of a nonrigid system may change without the angular momentum of the system changing if the system changes shape by moving mass closer to or farther from the rotational axis If the total angular momentum of a system changes, that change will be equivalent to the angular impulse exerted on the system. If the total angular momentum of a system changes, that change will be equivalent to the angular impulse exerted on the system.",
                "raw_code": "6.4.A.2",
                "legacy_ids": [
                  "6.4.A.2",
                  "6.4.A.2.i",
                  "6.4.A.2.ii",
                  "6.4.A.2.iii",
                  "6.4.A.2.iv"
                ]
              },
              {
                "id": "APPhy1.6.4.3",
                "text": "Angular momentum is conserved in all interactions.",
                "raw_code": "6.4.B.1",
                "legacy_ids": [
                  "6.4.B.1"
                ]
              },
              {
                "id": "APPhy1.6.4.4",
                "text": "If the net external torque exerted on a selected object or rigid system is zero, the total angular momentum of that system is constant.",
                "raw_code": "6.4.B.2",
                "legacy_ids": [
                  "6.4.B.2"
                ]
              },
              {
                "id": "APPhy1.6.4.5",
                "text": "If the net external torque exerted on a selected object or rigid system is nonzero, angular momentum is transferred between the system and the environment.",
                "raw_code": "6.4.B.3",
                "legacy_ids": [
                  "6.4.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.6.5",
            "name": "Rolling",
            "legacy_codes": [
              "6.5.A",
              "6.5.B",
              "6.5.C"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.5.1",
                "text": "The total kinetic energy of a system is the sum of the system’s translational and rotational kinetic energies.",
                "raw_code": "6.5.A.1",
                "legacy_ids": [
                  "6.5.A.1"
                ]
              },
              {
                "id": "APPhy1.6.5.2",
                "text": "While rolling without slipping, the translational motion of a system's center of mass is related to the rotational motion of the system itself with the equations: $$\\\\Delta x_{\\\\rm cm} = r \\\\Delta \\\\theta$$ $$v_{\\\\rm cm} = r\\\\omega$$ $$a_{\\\\rm cm} = r\\\\alpha$$",
                "raw_code": "6.5.B.1",
                "legacy_ids": [
                  "6.5.B.1"
                ]
              },
              {
                "id": "APPhy1.6.5.3",
                "text": "For ideal cases, rolling without slipping implies that the frictional force does not dissipate any energy from the rolling system.",
                "raw_code": "6.5.B.2",
                "legacy_ids": [
                  "6.5.B.2"
                ]
              },
              {
                "id": "APPhy1.6.5.4",
                "text": "When slipping, the motion of a system's center of mass and the system's rotational motion cannot be directly related. When a rotating system is slipping relative to another surface, the point of application of the force of kinetic friction exerted on the system moves with respect to the surface, so the force of kinetic friction will dissipate energy from the system.",
                "raw_code": "6.5.C.1",
                "legacy_ids": [
                  "6.5.C.1"
                ]
              },
              {
                "id": "APPhy1.6.5.5",
                "text": "When a rotating system is slipping relative to another surface, the point of application of the force of kinetic friction exerted on the system moves with respect to the surface, so the force of kinetic friction will dissipate energy from the system.",
                "raw_code": "6.5.C.2",
                "legacy_ids": [
                  "6.5.C.2"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.6.6",
            "name": "Motion of Orbiting Satellites",
            "legacy_codes": [
              "6.6.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.6.6.1",
                "text": "In a system consisting only of a massive central object and an orbiting satellite with mass that is negligible in comparison to the central object's mass, the motion of the central object itself is negligible.",
                "raw_code": "6.6.A.1",
                "legacy_ids": [
                  "6.6.A.1"
                ]
              },
              {
                "id": "APPhy1.6.6.2",
                "text": "The motion of satellites in orbits is constrained by conservation laws. In circular orbits, the system's total mechanical energy, the system's gravitational potential energy, and the satellite's angular momentum and kinetic energy are constant. In elliptical orbits, the system's total mechanical energy and the satellite's angular momentum are constant, but the system's gravitational potential energy and the satellite's kinetic energy can each change. The gravitational potential energy of a system consisting of a satellite and a massive central object is defined to be zero when the satellite is an infinite distance from the central object. Relevant equation: $$U_g = -G \\\\frac{m_1 m_2}{r}$$",
                "raw_code": "6.6.A.2",
                "legacy_ids": [
                  "6.6.A.2",
                  "6.6.A.2.i",
                  "6.6.A.2.ii",
                  "6.6.A.2.iii"
                ]
              },
              {
                "id": "APPhy1.6.6.3",
                "text": "The total energy of a system consisting of a satellite orbiting a central object in a circular path can be written in terms of the gravitational potential energy of that system or the kinetic energy of the satellite. Derived equations: $$K = -\\\\frac{1}{2}U$$ $$E_{total} = \\\\frac{1}{2}U = -\\\\frac{GMm}{2r}$$ When the only force exerted on a satellite is gravity from a central object, a satellite that reaches escape velocity will move away from the central body until its speed reaches zero at an infinite distance from the central body. The escape velocity of a satellite from a central body of mass M can be derived using conservation of energy laws. Derived equation: $$v_{\\\\rm esc} = \\\\sqrt{\\\\frac{2GM}{r}}$$",
                "raw_code": "6.6.A.3",
                "legacy_ids": [
                  "6.6.A.3",
                  "6.6.A.3.i",
                  "6.6.A.3.ii"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.7",
        "name": "Unit 7: Oscillations",
        "objectives": [
          {
            "code": "APPhy1.7.1",
            "name": "Defining Simple Harmonic Motion (SHM)",
            "legacy_codes": [
              "7.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.7.1.1",
                "text": "Simple harmonic motion is a special case of periodic motion.",
                "raw_code": "7.1.A.1",
                "legacy_ids": [
                  "7.1.A.1"
                ]
              },
              {
                "id": "APPhy1.7.1.2",
                "text": "SHM results when the magnitude of the restoring force exerted on an object is proportional to that object's displacement from its equilibrium position. Derived equation: $ma_x = -k\\\\Delta x$ A restoring force is a force that is exerted in a direction opposite to the object's displacement from an equilibrium position. An equilibrium position is a location at which the net force exerted on an object or system is zero. The motion of a pendulum with a small angular displacement can be modeled as simple harmonic motion because the restoring torque is proportional to the angular displacement.",
                "raw_code": "7.1.A.2",
                "legacy_ids": [
                  "7.1.A.2",
                  "7.1.A.2.i",
                  "7.1.A.2.ii",
                  "7.1.A.2.iii"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.7.2",
            "name": "Frequency and Period of SHM",
            "legacy_codes": [
              "7.2.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.7.2.1",
                "text": "The period of SHM is related to the angular frequency, $\\\\omega$ , of the object's motion by the following equation: $$T = \\\\frac{2\\\\pi}{\\\\omega} = \\\\frac{1}{f}$$ The period of an object-ideal-spring oscillator is given by the equation $$T_s = 2\\\\pi \\\\sqrt{\\\\frac{m}{k}}.$$ The period of a simple pendulum displaced by a small angle is given by the equation $$T_p = 2\\\\pi \\\\sqrt{\\\\frac{l}{g}}.$$",
                "raw_code": "7.2.A.1",
                "legacy_ids": [
                  "7.2.A.1",
                  "7.2.A.1.i",
                  "7.2.A.1.ii"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.7.3",
            "name": "Representing and Analyzing SHM",
            "legacy_codes": [
              "7.3.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.7.3.1",
                "text": "For an object exhibiting SHM, the displacement of that object measured from its equilibrium position can be represented by the equations $$x = A\\\\cos(2\\\\pi ft)$$ or $x = A\\\\sin(2\\\\pi ft)$ . Minima, maxima, and zeros of displacement, velocity, and acceleration are features of harmonic motion. Recognizing the positions or times at which the displacement, velocity, and acceleration for SHM have extrema or zeros can help in qualitatively describing the behavior of the motion.",
                "raw_code": "7.3.A.1",
                "legacy_ids": [
                  "7.3.A.1",
                  "7.3.A.1.i",
                  "7.3.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.7.3.2",
                "text": "Changing the amplitude of a system exhibiting SHM will not change the period of that system.",
                "raw_code": "7.3.A.2",
                "legacy_ids": [
                  "7.3.A.2"
                ]
              },
              {
                "id": "APPhy1.7.3.3",
                "text": "Properties of SHM can be determined and analyzed using graphical representations.",
                "raw_code": "7.3.A.3",
                "legacy_ids": [
                  "7.3.A.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.7.4",
            "name": "Energy of Simple Harmonic Oscillators",
            "legacy_codes": [
              "7.4.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.7.4.1",
                "text": "The total energy of a system exhibiting SHM is the sum of the system's kinetic and potential energies. Relevant equation: $$E_{\\\\text{total}} = U + K$$",
                "raw_code": "7.4.A.1",
                "legacy_ids": [
                  "7.4.A.1"
                ]
              },
              {
                "id": "APPhy1.7.4.2",
                "text": "Conservation of energy indicates that the total energy of a system exhibiting SHM is constant.",
                "raw_code": "7.4.A.2",
                "legacy_ids": [
                  "7.4.A.2"
                ]
              },
              {
                "id": "APPhy1.7.4.3",
                "text": "The kinetic energy of a system exhibiting SHM is at a maximum when the system's potential energy is at a minimum.",
                "raw_code": "7.4.A.3",
                "legacy_ids": [
                  "7.4.A.3"
                ]
              },
              {
                "id": "APPhy1.7.4.4",
                "text": "The potential energy of a system exhibiting SHM is at a maximum when the system’s kinetic energy is at a minimum. The minimum kinetic energy of a system exhibiting SHM is zero. Changing the amplitude of a system exhibiting SHM will change the maximum potential energy of the system and, therefore, the total energy of the system. Relevant equation for a spring–object system: $$E_{\\text{total}} = \\frac{1}{2}kA^2$$",
                "raw_code": "7.4.A.4",
                "legacy_ids": [
                  "7.4.A.4",
                  "7.4.A.4.i",
                  "7.4.A.4.ii"
                ]
              }
            ]
          }
        ]
      },
      {
        "code": "APPhy1.8",
        "name": "Unit 8: Fluids",
        "objectives": [
          {
            "code": "APPhy1.8.1",
            "name": "Internal Structure and Density",
            "legacy_codes": [
              "8.1.A"
            ],
            "subtopics": [
              {
                "id": "APPhy1.8.1.1",
                "text": "Distinguishing properties of solids, liquids, and gases stem from the varying interactions between atoms and molecules.",
                "raw_code": "8.1.A.1",
                "legacy_ids": [
                  "8.1.A.1"
                ]
              },
              {
                "id": "APPhy1.8.1.2",
                "text": "A fluid is a substance that has no fixed shape.",
                "raw_code": "8.1.A.2",
                "legacy_ids": [
                  "8.1.A.2"
                ]
              },
              {
                "id": "APPhy1.8.1.3",
                "text": "Fluids can be characterized by their density. Density is defined as a ratio of mass to volume. Relevant equation: $$\\\\rho = \\\\frac{m}{V}$$",
                "raw_code": "8.1.A.3",
                "legacy_ids": [
                  "8.1.A.3"
                ]
              },
              {
                "id": "APPhy1.8.1.4",
                "text": "An ideal fluid is incompressible and has no viscosity.",
                "raw_code": "8.1.A.4",
                "legacy_ids": [
                  "8.1.A.4"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.8.2",
            "name": "Pressure",
            "legacy_codes": [
              "8.2.A",
              "8.2.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.8.2.1",
                "text": "Pressure is a scalar quantity. described by the equation ESSENTIAL KNOWLEDGE Pressure is defined as the magnitude of the perpendicular force component exerted per unit area over a given surface area, as",
                "raw_code": "8.2.A.1",
                "legacy_ids": [
                  "8.2.A.1"
                ]
              },
              {
                "id": "APPhy1.8.2.2",
                "text": "$P = \\\\frac{F_{\\\\perp}}{A}$ .",
                "raw_code": "8.2.A.2",
                "legacy_ids": [
                  "8.2.A.2"
                ]
              },
              {
                "id": "APPhy1.8.2.3",
                "text": "The volume and density of a given amount of an incompressible fluid is constant regardless of the pressure exerted on that fluid.",
                "raw_code": "8.2.A.3",
                "legacy_ids": [
                  "8.2.A.3"
                ]
              },
              {
                "id": "APPhy1.8.2.4",
                "text": "The pressure exerted by a fluid is the result of the entirety of the interactions between the fluid's constituent particles and the surface with which those particles interact.",
                "raw_code": "8.2.B.1",
                "legacy_ids": [
                  "8.2.B.1"
                ]
              },
              {
                "id": "APPhy1.8.2.5",
                "text": "The absolute pressure of a fluid at a given point is equal to the sum of a reference pressure $P_0$ , such as the atmospheric pressure $P_{\\\\rm atm}$ , and the gauge pressure $P_{\\\\rm gauge}$ . Relevant equation: $$P = P_0 + \\\\rho g h$$",
                "raw_code": "8.2.B.2",
                "legacy_ids": [
                  "8.2.B.2"
                ]
              },
              {
                "id": "APPhy1.8.2.6",
                "text": "The gauge pressure of a vertical column of fluid is described by the equation $$P_{\\\\text{gauge}} = \\\\rho g h.$$",
                "raw_code": "8.2.B.3",
                "legacy_ids": [
                  "8.2.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.8.3",
            "name": "Fluids and Newton’s Laws",
            "legacy_codes": [
              "8.3.A",
              "8.3.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.8.3.1",
                "text": "Newton's laws can be used to describe the motion of particles within a fluid.",
                "raw_code": "8.3.A.1",
                "legacy_ids": [
                  "8.3.A.1"
                ]
              },
              {
                "id": "APPhy1.8.3.2",
                "text": "The macroscopic behavior of a fluid is a result of the internal interactions between the fluid's constituent particles and external forces exerted on the fluid.",
                "raw_code": "8.3.A.2",
                "legacy_ids": [
                  "8.3.A.2"
                ]
              },
              {
                "id": "APPhy1.8.3.3",
                "text": "The buoyant force is a net upward force exerted on an object by a fluid.",
                "raw_code": "8.3.B.1",
                "legacy_ids": [
                  "8.3.B.1"
                ]
              },
              {
                "id": "APPhy1.8.3.4",
                "text": "The buoyant force exerted on an object by a fluid is a result of the collective forces exerted on the object by the particles making up the fluid.",
                "raw_code": "8.3.B.2",
                "legacy_ids": [
                  "8.3.B.2"
                ]
              },
              {
                "id": "APPhy1.8.3.5",
                "text": "The magnitude of the buoyant force exerted on an object by a fluid is equivalent to the weight of the fluid displaced by the object. Relevant equation: $$F_b = \\\\rho V g$$",
                "raw_code": "8.3.B.3",
                "legacy_ids": [
                  "8.3.B.3"
                ]
              }
            ]
          },
          {
            "code": "APPhy1.8.4",
            "name": "Fluids and Conservation Laws",
            "legacy_codes": [
              "8.4.A",
              "8.4.B"
            ],
            "subtopics": [
              {
                "id": "APPhy1.8.4.1",
                "text": "A difference in pressure between two locations causes a fluid to flow. The rate at which matter enters a fluid-filled tube open at both ends must equal the rate at which matter exits the tube. The rate at which matter flows into a location is proportional to the crosssectional area of the flow and the speed at which the fluid flows. Derived equation: $$\\\\frac{V}{t} = Av$$",
                "raw_code": "8.4.A.1",
                "legacy_ids": [
                  "8.4.A.1",
                  "8.4.A.1.i",
                  "8.4.A.1.ii"
                ]
              },
              {
                "id": "APPhy1.8.4.2",
                "text": "The continuity equation for fluid flow describes conservation of mass flow rate in incompressible fluids. Relevant equation: $$A_1 \\ u_1 = A_2 \\ u_2$$",
                "raw_code": "8.4.A.2",
                "legacy_ids": [
                  "8.4.A.2"
                ]
              },
              {
                "id": "APPhy1.8.4.3",
                "text": "A difference in gravitational potential energies between two locations in a fluid will result in a difference in kinetic energy and pressure between those two locations that is described by conservation laws.",
                "raw_code": "8.4.B.1",
                "legacy_ids": [
                  "8.4.B.1"
                ]
              },
              {
                "id": "APPhy1.8.4.4",
                "text": "Bernoulli’s equation describes the conservation of mechanical energy in fluid flow.",
                "raw_code": "8.4.B.2",
                "legacy_ids": [
                  "8.4.B.2"
                ]
              },
              {
                "id": "APPhy1.8.4.5",
                "text": "Torricelli’s theorem relates the speed of a fluid exiting an opening to the difference in height between the opening and the top surface of the fluid and can be derived from conservation of energy principles.",
                "raw_code": "8.4.B.3",
                "legacy_ids": [
                  "8.4.B.3"
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
