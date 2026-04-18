cmake_minimum_required(VERSION 4.0)

project(RockoonIO)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)  # Set for clangd

add_subdirectory(3rd-party)

set(BML_DIR "${CMAKE_CURRENT_LIST_DIR}/3rd-party/BMLPlus/lib/cmake/BML")
set(VirtoolsSDK_DIR "${CMAKE_CURRENT_LIST_DIR}/3rd-party/Virtools-SDK-2.1/CMake")
find_package(BML REQUIRED)
find_package(VirtoolsSDK REQUIRED)

message(STATUS "BML_DIR=${BML_DIR}")
message(STATUS "VirtoolsSDK_DIR=${VirtoolsSDK_DIR}")

add_library(RockoonIO SHARED
			src/MapLoader.h
			src/MapLoader.cpp
			src/RockoonIO.h
			src/RockoonIO.cpp
)

target_include_directories(RockoonIO PRIVATE ${BML_INCLUDE_DIRS})
target_link_libraries(RockoonIO
	PUBLIC
	BML
)
set_target_properties(RockoonIO PROPERTIES OUTPUT_NAME "RockoonIO")
set_target_properties(RockoonIO PROPERTIES SUFFIX ".bmodp")